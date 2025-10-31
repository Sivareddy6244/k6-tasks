Good — I’ll show exactly how to run a GitLab pipeline that (1) generates Kinesis traffic with your k6 script, (2) runs the metrics-collector so it can query Lambda metrics, (3) has k6 poll the collector and record Lambda metrics as custom metrics, and (4) produces a k6 HTML report that contains both the Kinesis request metrics and the Lambda metrics.

What I did: I created a complete GitLab CI job you can drop into your repo. The job starts the metrics collector (in the same job), waits for it to be healthy, runs your existing k6 Kinesis script (merged with the polling code so it records custom metrics), writes k6 JSON output, converts the JSON into an HTML report, and stores the JSON + HTML as job artifacts. I also included the required commands to set up credentials (AWS + GCP) in CI securely (use CI variables), notes about metric alignment and caching, and IAM permissions you’ll need.

Below is an example .gitlab-ci.yml you can use. Paste it into your repo (adjust paths/filenames if your scripts live elsewhere).

```yaml name=.gitlab-ci.yml
stages:
  - test

variables:
  # tune these or override in project/group CI variables
  NODE_IMAGE: "node:18"
  K6_VERSION: "0.45.0" # choose appropriate k6 version if you want
  METRICS_COLLECTOR_PORT: "3000"
  METRICS_COLLECTOR_URL: "http://localhost:${METRICS_COLLECTOR_PORT}/metrics"
  # default collector query params will be appended in script using CI vars

k6_load_test:
  image: ${NODE_IMAGE}
  stage: test
  # If your runner requires services / special permissions (docker-in-docker) then adapt; this uses node image so no dind required.
  before_script:
    - apt-get update -y
    - apt-get install -y curl gnupg2 ca-certificates --no-install-recommends
    # install k6 from official repo
    - curl -s https://dl.k6.io/key.gpg | apt-key add -
    - echo "deb https://dl.k6.io/deb stable main" | tee /etc/apt/sources.list.d/k6.list
    - apt-get update -y
    - apt-get install -y k6
    # install k6-reporter (for HTML from json). Alternatively you can use other reporter tools.
    - npm install -g k6-reporter || true
    # install Node deps for metrics collector if present in repo
    - npm ci || true
  script:
    # 1) Prepare GCP service account JSON (pass GCP_SA_KEY in CI as base64-encoded string)
    - |
      if [ -n "$GCP_SA_KEY" ]; then
        echo "Decoding GCP_SA_KEY into /tmp/gcp-key.json"
        echo "$GCP_SA_KEY" | base64 -d > /tmp/gcp-key.json
        export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-key.json
      else
        echo "No GCP_SA_KEY provided — ensure GOOGLE_APPLICATION_CREDENTIALS is set in environment or service account available via metadata."
      fi
    # 2) Start metrics collector (runs in background in the same job)
    - echo "Starting metrics collector (background)..."
    - node metrics-collector.js > collector.log 2>&1 &
    - COLLECTOR_PID=$!
    - echo "Collector PID: $COLLECTOR_PID"
    # 3) Wait for collector to be ready (simple health probe)
    - |
      for i in $(seq 1 15); do
        if curl -sSf "${METRICS_COLLECTOR_URL}?lambda=${LAMBDA_FUNCTION_NAME:-}&gcp_project=${GCP_PROJECT:-}" >/dev/null 2>&1; then
          echo "Collector is up"
          break
        fi
        echo "Waiting for collector... ($i)"
        sleep 1
      done
    - |
      if ! curl -sSf "${METRICS_COLLECTOR_URL}?lambda=${LAMBDA_FUNCTION_NAME:-}&gcp_project=${GCP_PROJECT:-}" >/dev/null 2>&1; then
        echo "Collector failed to start; printing last collector.log"
        tail -n +1 collector.log || true
        kill $COLLECTOR_PID || true
        exit 1
      fi
    # 4) Run k6 load test (kinesis + polling collector). Make sure your script file name matches.
    # Pass METRICS_COLLECTOR_URL with query params to include Lambda name & optionally GCP project
    - |
      export METRICS_COLLECTOR_URL="${METRICS_COLLECTOR_URL}?lambda=${LAMBDA_FUNCTION_NAME}&gcp_project=${GCP_PROJECT}"
      echo "Running k6. METRICS_COLLECTOR_URL=${METRICS_COLLECTOR_URL}"
      k6 run --out json=results.json k6_kinesis_with_lambda_bigquery_metrics.js
    # 5) Convert results.json -> HTML (k6-reporter)
    - |
      if command -v k6-reporter >/dev/null 2>&1; then
        k6-reporter results.json -o k6-report.html || echo "k6-reporter failed"
      else
        echo "k6-reporter not installed; saving JSON only"
      fi
  after_script:
    # Stop collector
    - echo "Stopping collector (PID $COLLECTOR_PID)"
    - kill $COLLECTOR_PID || true
    - sleep 1
    - echo "Collector log tail:"
    - tail -n 200 collector.log || true
  artifacts:
    when: always
    expire_in: 1 week
    paths:
      - results.json
      - k6-report.html
      - collector.log
  only:
    - branches
```

How this pipeline works (narrative)
- The job installs k6 and k6-reporter, then starts the metrics-collector (the Node.js service you already have) in the background so it can query AWS CloudWatch for Lambda metrics while the load test runs. I used the same job to run the collector and k6 to make networking trivial: the collector is reachable at http://localhost:3000 from within the job.
- The job waits for the collector to respond to a simple health call before beginning the k6 run. This guarantees k6 can poll the collector during the test.
- The k6 script kicks off Kinesis PutRecord traffic (your SigV4 code) and, at configured intervals, calls METRICS_COLLECTOR_URL to fetch Lambda metrics. Each collector response is translated into k6 custom metrics (Trend/Gauge/Counter). Those metrics are included in k6 output JSON.
- After k6 completes, the job converts results.json into an HTML report (k6-reporter) and stores both the JSON and HTML as job artifacts.

What you must provide in GitLab CI variables (secure & masked)
- AWS_REGION
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- STREAM_NAME
- (optional) AWS_SESSION_TOKEN (if using temporary credentials)
- LAMBDA_FUNCTION_NAME (the Lambda that processes Kinesis events)
- GCP_PROJECT (if your collector fetches BigQuery metrics too)
- GCP_SA_KEY (base64-encoded service account JSON) — recommended approach:
  - On your machine: cat gcp-key.json | base64 | tr -d '\n' then paste into the GitLab CI variable (masked/protected).
- (optional) METRICS_COLLECTOR_URL override if you run the collector elsewhere.

Permissions required
- Collector (AWS):
  - cloudwatch:GetMetricData
  - cloudwatch:ListMetrics (optional)
  - (if you query Kinesis metrics from CloudWatch) permission to read those metrics
- Collector (GCP) if used:
  - roles/monitoring.viewer or monitoring.timeSeries.list permissions
- k6 runner: needs only network access to the Kinesis endpoint and to the collector (in this setup they run inside the same job).

Key configuration details and tips
- Poll frequency vs collector cache:
  - The collector caches results for CACHE_TTL_SECONDS (default 10s). In the k6 script use POLL_EVERY_ITER or sleep intervals so you don’t poll too frequently. This reduces API calls and avoids hitting CloudWatch quotas.
- Metric delay and alignment:
  - CloudWatch metric data may be delayed a few seconds; BigQuery/monitoring metrics can lag more. Use METRICS_WINDOW_SECONDS (collector) tuned to your test length (e.g., 60s for continuous runs or 30s for short bursts) so the collector queries the right time window.
- What will appear in the k6 HTML report:
  - Kinesis metrics that k6 collects are the standard HTTP/request metrics (request count, latencies, errors) and your custom checks. These appear by default.
  - Lambda metrics: since k6 polls the collector and records custom metrics (e.g., lambda_duration_ms, lambda_invocations, lambda_errors), these custom metrics appear in the k6 JSON output and therefore in HTML reporters that consume the JSON (like k6-reporter). The k6 HTML will show both Kinesis request metrics (native) and Lambda metrics (as custom metrics).
- If your current HTML reporter does not show custom metrics:
  - Confirm the reporter supports k6 custom metrics from JSON. If not, you can push JSON to Influx/Grafana or create a small custom HTML view that extracts the custom metrics from results.json and renders charts.

Small excerpts to add/adapt from earlier code
- Make sure k6 script uses METRICS_COLLECTOR_URL env variable:
  - export METRICS_COLLECTOR_URL="${METRICS_COLLECTOR_URL}?lambda=${LAMBDA_FUNCTION_NAME}&gcp_project=${GCP_PROJECT}"
- In the metrics-collector CI setup we decode GCP_SA_KEY into /tmp/gcp-key.json and set GOOGLE_APPLICATION_CREDENTIALS to point to it.
- Keep collector caching reasonable (CACHE_TTL_SECONDS default = 10) to avoid exceeding GetMetricData quotas during high-frequency tests.

What you should expect when pipeline runs
- Collector starts and answers /metrics.
- k6 runs and posts events to Kinesis (your PutRecord logic).
- Kinesis triggers Lambda (as per your pipeline).
- Lambda emits metrics to CloudWatch (Invocations, Duration, Errors).
- Periodically k6 polls the collector; collector pulls CloudWatch data and returns JSON.
- k6 records the returned Lambda metrics as custom metrics.
- The generated results.json contains:
  - native k6 metrics (http_req_* etc.)
  - custom metrics (lambda_duration_ms, lambda_invocations, lambda_errors, bigquery_bytes_processed if enabled)
- k6-report.html will show both Kinesis traffic metrics (native) and the custom Lambda metrics you recorded.

Possible next steps I can provide for you right away (I already prepared the pipeline above; tell me which you want next):
- A ready-to-commit .gitlab-ci.yml adapted to your repo layout (I can generate one tailored to exact file paths).
- A small helper script to run the collector in Docker rather than Node directly in the job (if you prefer containers).
- A CI job version that runs the collector in its own job (service pattern) and k6 in a separate job (requires network setup between jobs; more complex).
- A sample GitLab CI variable list (with example values masked) you can copy/paste into your project’s CI settings.

If you want, I will now:
- produce the ready-to-commit `.gitlab-ci.yml` (with any path changes you need) and a sample list of the CI variables to add (masked/protected).
