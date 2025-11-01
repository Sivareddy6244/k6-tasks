import http from "k6/http";
import { check, fail } from "k6";
import crypto from "k6/crypto";
import encoding from "k6/encoding";
import { Trend, Gauge, Counter } from "k6/metrics";

/*
  k6_kinesis_with_lambda_bigquery_metrics.js

  - Your original Kinesis PutRecord logic (SigV4 signing) is preserved.
  - Added polling of an external metrics collector (recommended) that exposes
    Lambda + BigQuery metrics at a simple JSON endpoint.
  - The polled values are recorded as k6 custom metrics so they appear in
    k6 JSON output and HTML reports.

  Required env vars for Kinesis use:
    AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, STREAM_NAME
  Optional:
    AWS_SESSION_TOKEN, AWS_KINESIS_HOST (hostname without scheme), HTTPS_PROXY, HTTP_PROXY, NO_PROXY

  Required/optional env vars for metrics collection:
    METRICS_COLLECTOR_URL (default: http://localhost:3000/metrics)
    POLL_EVERY_ITER (default: 5)

  Usage example:
    METRICS_COLLECTOR_URL="http://localhost:3000/metrics?lambda=my-lambda&gcp_project=my-project" \
      AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... STREAM_NAME=my-stream \
      k6 run --out json=results.json k6_kinesis_with_lambda_bigquery_metrics.js
*/

/* ---------------------------
   k6 custom metrics (for reports)
   --------------------------- */
const lambdaDuration = new Trend('lambda_duration_ms');
const lambdaInvocations = new Trend('lambda_invocations');
const lambdaErrors = new Gauge('lambda_errors');
const bqBytesProcessed = new Trend('bigquery_bytes_processed');
const externalPolls = new Counter('external_metrics_poll_count');

/* ---------------------------
   Env & basic validation (Kinesis)
   --------------------------- */
const region = __ENV.AWS_REGION;
const accessKey = __ENV.AWS_ACCESS_KEY_ID;
const secretKey = __ENV.AWS_SECRET_ACCESS_KEY;
const sessionToken = __ENV.AWS_SESSION_TOKEN;
const streamName = __ENV.STREAM_NAME;
let envHost = __ENV.AWS_KINESIS_HOST;

if (!region) fail("Missing AWS_REGION");
if (!accessKey) fail("Missing AWS_ACCESS_KEY_ID");
if (!secretKey) fail("Missing AWS_SECRET_ACCESS_KEY");
if (!streamName) fail("Missing STREAM_NAME");

/* ---------------------------
   Helpers (HMAC, base64, sha256)
   --------------------------- */
function hmacB64(key, data) {
    return crypto.hmac("sha256", key, data, "base64");
}
function b64ToBytes(b64) {
    return encoding.b64decode(b64, "std");
}
function sha256Hex(data) {
    return crypto.sha256(data, "hex");
}
function getSigningKeyBytes(sk, dateStamp, regionName, serviceName) {
    const kDate = b64ToBytes(hmacB64("AWS4" + sk, dateStamp));
    const kRegion = b64ToBytes(hmacB64(kDate, regionName));
    const kService = b64ToBytes(hmacB64(kRegion, serviceName));
    const kSigning = b64ToBytes(hmacB64(kService, "aws4_request"));
    return kSigning;
}
function buildCanonical(headersObj) {
    const lower = {};
    for (const k in headersObj) {
        const v = headersObj[k];
        if (v !== undefined && v !== null && v !== "")
            lower[k.toLowerCase()] = String(v).trim();
    }
    const keys = Object.keys(lower).sort();
    let canonicalHeaders = "";
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        canonicalHeaders += key + ":" + lower[key] + "\n";
    }
    const signedHeaders = keys.join(";");
    return { canonicalHeaders, signedHeaders };
}
function sanitizedHostInput(raw) {
    if (!raw) return "";
    let h = String(raw).trim();
    if (h.startsWith("https://")) h = h.substring("https://".length);
    else if (h.startsWith("http://")) h = h.substring("http://".length);
    if (h.endsWith("/")) h = h.substring(0, h.length - 1);
    return h;
}
function safeTruncate(str, maxLen) {
    if (typeof str != "string") return str;
    return str.length <= maxLen ? str : str.substring(0, maxLen) + "...[truncated]";
}
function nowAmz() {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substring(0, 8);
    return { now, amzDate, dateStamp };
}

/* ---------------------------
   Kinesis-specific constants
   --------------------------- */
const service = "kinesis";
envHost = sanitizedHostInput(envHost);
const host = envHost && envHost.length > 0 ? envHost : "kinesis." + region + ".amazonaws.com";
const endpoint = "https://" + host + "/";

console.log("Using kinesis host: " + host);

/* ---------------------------
   External metrics collector config
   --------------------------- */
const METRICS_COLLECTOR_URL = __ENV.METRICS_COLLECTOR_URL || "http://localhost:3000/metrics";
const POLL_EVERY_ITER = Number(__ENV.POLL_EVERY_ITER || 5);

/* ---------------------------
   Poll metrics collector and record custom metrics
   --------------------------- */
function pollExternalMetrics() {
    try {
        const r = http.get(METRICS_COLLECTOR_URL, { timeout: "10s" });
        if (r.status !== 200) {
            console.warn(`Metrics collector returned ${r.status}`);
            return;
        }
        const body = r.body ? JSON.parse(r.body) : {};
        // Expected shape: { lambda: { duration_ms, invocations, errors }, bigquery: { bytes_processed } }
        if (body.lambda) {
            if (body.lambda.duration_ms != null) lambdaDuration.add(Number(body.lambda.duration_ms));
            if (body.lambda.invocations != null) lambdaInvocations.add(Number(body.lambda.invocations));
            if (body.lambda.errors != null) lambdaErrors.add(Number(body.lambda.errors));
        }
        if (body.bigquery) {
            if (body.bigquery.bytes_processed != null) bqBytesProcessed.add(Number(body.bigquery.bytes_processed));
        }
        externalPolls.add(1);
    } catch (e) {
        console.error("Failed to poll external metrics: " + e);
    }
}

/* ---------------------------
   k6 options (tweak via ENV)
   --------------------------- */
export let options = {
    vus: Number(__ENV.K6_VUS || 10),
    duration: __ENV.K6_DURATION || "1m",
    thresholds: {
        "http_req_duration": ["p(95)<5000"]
    }
};

/* ---------------------------
   Main test function - Kinesis PutRecord + periodic poll
   --------------------------- */
export default function () {
    // Preflight reachability probe
    const pre = http.get(endpoint, { timeout: "10s" });
    console.log("PreFlight status: " + pre.status);

    // Build one PutRecord payload
    const t = nowAmz();
    const record = {
        eventId: Math.floor(Math.random() * 1e12),
        type: "click",
        timestamp: new Date().toISOString(),
    };
    const dataB64 = encoding.b64encode(JSON.stringify(record), "std");
    const bodyObj = {
        StreamName: streamName,
        Data: dataB64,
        PartitionKey: "partition-1",
    };
    const body = JSON.stringify(bodyObj);

    // SigV4 signing preparations
    const method = "POST";
    const canonicalUri = "/";
    const canonicalQuerystring = "";

    const amzDate = t.amzDate;
    const dateStamp = t.dateStamp;
    const headersToSend = {
        "Content-Type": "application/x-amz-json-1.1",
        "Host": host,
        "X-Amz-Date": amzDate,
        "X-Amz-Target": "Kinesis_20131202.PutRecord",
    };
    if (sessionToken) {
        headersToSend["x-Amz-Security-Token"] = sessionToken;
    }

    const canon = buildCanonical(headersToSend);
    const canonicalHeaders = canon.canonicalHeaders;
    const signedHeaders = canon.signedHeaders;
    const payloadHash = sha256Hex(body);
    const canonicalRequest =
        method + "\n" +
        canonicalUri + "\n" +
        canonicalQuerystring + "\n" +
        canonicalHeaders + "\n" +
        signedHeaders + "\n" +
        payloadHash;

    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = dateStamp + "/" + region + "/" + service + "/aws4_request";
    const stringToSign =
        algorithm + "\n" +
        amzDate + "\n" +
        credentialScope + "\n" +
        sha256Hex(canonicalRequest);

    const signingKeyBytes = getSigningKeyBytes(secretKey, dateStamp, region, service);
    const signature = crypto.hmac("sha256", signingKeyBytes, stringToSign, "hex");

    const authorizationHeader =
        algorithm + " " +
        "Credential=" + accessKey + "/" + credentialScope + ", " +
        "SignedHeaders=" + signedHeaders + ", " +
        "Signature=" + signature;

    const finalHeaders = {};
    for (const hk in headersToSend) finalHeaders[hk] = headersToSend[hk];
    finalHeaders["Authorization"] = authorizationHeader;

    // Simple retry for transient errors (throttling, 5xx)
    const maxAttempts = 3;
    const backoffMs = [0, 200, 500];
    let attempt = 0;
    let res = null;
    for (attempt = 0; attempt < maxAttempts; attempt++) {
        res = http.post(endpoint, body, { headers: finalHeaders, timeout: "120s" });
        console.log("Timings: " + JSON.stringify(res.timings));
        const errType = res.headers ? (res.headers["x-amzn-errortype"] || res.headers["X-Amzn-Errortype"]) || "" : "";
        const reqId = res.headers ? (res.headers["x-amzn-requestid"] || res.headers["X-Amzn-Requestid"]) || "" : "";
        console.log("Attempt " + (attempt + 1) + " status: " + res.status + " requestId: " + reqId + " errorType: " + errType);

        if (res.status === 200) break;

        const statusClass = Math.floor(res.status / 100);
        const is5xx = statusClass === 5;
        const isThrottle = errType.indexOf("ProvisionedThroughputExceededException") >= 0 || errType.indexOf("Throttling") >= 0;
        if (!(is5xx || isThrottle)) break;
        // backoff (non-blocking busy-wait not ideal but k6 does not support async sleep here)
        // We avoid calling sleep() inside attempts loop to keep timing predictable; just continue
    }

    // Validate success and parse body
    let ok = false;
    let seq = "";
    let shard = "";
    try {
        if (res && res.status === 200 && res.body) {
            const parsed = JSON.parse(res.body);
            seq = parsed.SequenceNumber || "";
            shard = parsed.ShardId || "";
            ok = Boolean(seq && shard);
        }
    } catch (e) {
        // parsing failed
    }

    const checks = {
        "PutRecord HTTP 200": () => (res && res.status === 200),
        "PutRecord has SequenceNumber": () => ok,
    };
    check(res, checks);

    if (!ok) {
        const bodyPreview = res && res.body ? safeTruncate(res.body, 500) : "";
        console.error("PutRecord failed. Status: " + (res ? res.status : "n/a") + " Body: " + bodyPreview);
        fail("PutRecord did not succeed");
    } else {
        console.log("PutRecord OK. ShardId: " + shard + " SequenceNumber: " + seq);
    }

    // Periodically poll external metrics collector to gather Lambda + BigQuery metrics
    if (__ITER % POLL_EVERY_ITER === 0) {
        pollExternalMetrics();
    }
}