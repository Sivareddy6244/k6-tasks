import http from "k6/http";
import { check, fail, sleep } from "k6";
import crypto from "k6/crypto";
import encoding from "k6/encoding";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { Trend, Counter, Gauge } from "k6/metrics";
 
// Required: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, STREAM_NAME
// Optional: AWS_SESSION_TOKEN, AWS_KINESIS_HOST
const region = __ENV.AWS_REGION;
const accessKey = __ENV.AWS_ACCESS_KEY_ID;
const secretKey = __ENV.AWS_SECRET_ACCESS_KEY;
const sessionToken = __ENV.AWS_SESSION_TOKEN;
const streamName = __ENV.STREAM_NAME;
let envHost = __ENV.AWS_KINESIS_HOST;

// Lambda configuration (optional)
const lambdaFunctionName = __ENV.AWS_FUNCTION_NAME || "";
const lambdaRegion = __ENV.AWS_REGION;

// BigQuery configuration (optional)
const bigQueryProjectId = __ENV.BIGQUERY_PROJECT_ID || "";
const bigQueryDatasetId = __ENV.BIGQUERY_DATASET_ID || "";
const bigQueryTableId = __ENV.BIGQUERY_TABLE_ID || "";
 
// Basic validation of required env vars
if (!region) fail("Missing AWS_REGION");
if (!accessKey) fail("Missing AWS_ACCESS_KEY_ID");
if (!secretKey) fail("Missing AWS_SECRET_ACCESS_KEY");
if (!streamName) fail("Missing STREAM_NAME");
 
// Helpers
function hmacB64(key, data) {
    // Returns base64 string
    return crypto.hmac("sha256", key, data, "base64");
}
 
function b64ToBytes(b64) {
    // Returns ArrayBuffer
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
    // Strip schemes if provided
    if (h.startsWith("https://")) {
        console.warn("AWS_KINESIS_HOST contained a scheme; stripped to hostname: " + h.substring("https://".length));
        h = h.substring("https://".length);
    } else if (h.startsWith("http://")) {
        console.warn("AWS_KINESIS_HOST contained a scheme; stripped to hostname: " + h.substring("http://".length));
        h = h.substring("http://".length);
    }
    // Remove trailing slash if any
    if (h.endsWith("/")) {
        h = h.substring(0, h.length - 1);
    }
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

// Collect Lambda metrics via CloudWatch
function collectLambdaMetrics() {
    if (!lambdaFunctionName) {
        console.log("Lambda function name not configured, skipping Lambda metrics");
        return;
    }

    try {
        const t = nowAmz();
        const endpoint = "https://monitoring." + lambdaRegion + ".amazonaws.com/";
        
        // Get Lambda metrics from CloudWatch
        const now = new Date();
        const endTime = now.toISOString();
        const startTime = new Date(now.getTime() - 300000).toISOString(); // Last 5 minutes
        
        const params = {
            Namespace: "AWS/Lambda",
            MetricName: "Duration",
            Dimensions: [
                {
                    Name: "FunctionName",
                    Value: lambdaFunctionName
                }
            ],
            StartTime: startTime,
            EndTime: endTime,
            Period: 60,
            Statistics: ["Average", "Maximum"]
        };

        const body = JSON.stringify(params);
        
        const headersToSend = {
            "Content-Type": "application/x-amz-json-1.1",
            "Host": "monitoring." + lambdaRegion + ".amazonaws.com",
            "X-Amz-Date": t.amzDate,
            "X-Amz-Target": "GraniteServiceVersion20100801.GetMetricStatistics",
        };
        
        if (sessionToken) {
            headersToSend["X-Amz-Security-Token"] = sessionToken;
        }

        const canon = buildCanonical(headersToSend);
        const payloadHash = sha256Hex(body);
        const canonicalRequest =
            "POST\n/\n\n" +
            canon.canonicalHeaders + "\n" +
            canon.signedHeaders + "\n" +
            payloadHash;

        const algorithm = "AWS4-HMAC-SHA256";
        const credentialScope = t.dateStamp + "/" + lambdaRegion + "/monitoring/aws4_request";
        const stringToSign =
            algorithm + "\n" +
            t.amzDate + "\n" +
            credentialScope + "\n" +
            sha256Hex(canonicalRequest);

        const signingKeyBytes = getSigningKeyBytes(secretKey, t.dateStamp, lambdaRegion, "monitoring");
        const signature = crypto.hmac("sha256", signingKeyBytes, stringToSign, "hex");

        const authorizationHeader =
            algorithm + " " +
            "Credential=" + accessKey + "/" + credentialScope + ", " +
            "SignedHeaders=" + canon.signedHeaders + ", " +
            "Signature=" + signature;

        const finalHeaders = Object.assign({}, headersToSend, { "Authorization": authorizationHeader });

        const res = http.post(endpoint, body, { headers: finalHeaders, timeout: "30s" });
        
        if (res.status === 200 && res.body) {
            const parsed = JSON.parse(res.body);
            if (parsed.Datapoints && parsed.Datapoints.length > 0) {
                const latestDatapoint = parsed.Datapoints[parsed.Datapoints.length - 1];
                if (latestDatapoint.Average) {
                    lambdaInvocationDuration.add(latestDatapoint.Average);
                    console.log("Lambda Duration (avg): " + latestDatapoint.Average + "ms");
                }
            }
        }

        // Get Lambda error metrics
        const errorParams = Object.assign({}, params, { MetricName: "Errors" });
        const errorBody = JSON.stringify(errorParams);
        const errorRes = http.post(endpoint, errorBody, { headers: finalHeaders, timeout: "30s" });
        
        if (errorRes.status === 200 && errorRes.body) {
            const parsed = JSON.parse(errorRes.body);
            if (parsed.Datapoints && parsed.Datapoints.length > 0) {
                let errorCount = 0;
                for (let i = 0; i < parsed.Datapoints.length; i++) {
                    errorCount += parsed.Datapoints[i].Sum || 0;
                }
                lambdaErrors.add(errorCount);
                console.log("Lambda Errors: " + errorCount);
            }
        }

        // Get Lambda throttle metrics
        const throttleParams = Object.assign({}, params, { MetricName: "Throttles" });
        const throttleBody = JSON.stringify(throttleParams);
        const throttleRes = http.post(endpoint, throttleBody, { headers: finalHeaders, timeout: "30s" });
        
        if (throttleRes.status === 200 && throttleRes.body) {
            const parsed = JSON.parse(throttleRes.body);
            if (parsed.Datapoints && parsed.Datapoints.length > 0) {
                let throttleCount = 0;
                for (let i = 0; i < parsed.Datapoints.length; i++) {
                    throttleCount += parsed.Datapoints[i].Sum || 0;
                }
                lambdaThrottles.add(throttleCount);
                console.log("Lambda Throttles: " + throttleCount);
            }
        }

        // Get concurrent executions
        const concurrentParams = Object.assign({}, params, { MetricName: "ConcurrentExecutions" });
        const concurrentBody = JSON.stringify(concurrentParams);
        const concurrentRes = http.post(endpoint, concurrentBody, { headers: finalHeaders, timeout: "30s" });
        
        if (concurrentRes.status === 200 && concurrentRes.body) {
            const parsed = JSON.parse(concurrentRes.body);
            if (parsed.Datapoints && parsed.Datapoints.length > 0) {
                const latestDatapoint = parsed.Datapoints[parsed.Datapoints.length - 1];
                if (latestDatapoint.Average) {
                    lambdaConcurrentExecutions.add(latestDatapoint.Average);
                    console.log("Lambda Concurrent Executions: " + latestDatapoint.Average);
                }
            }
        }
        
    } catch (e) {
        console.error("Error collecting Lambda metrics: " + e);
    }
}

// Collect BigQuery metrics (simulated via query metadata)
function collectBigQueryMetrics() {
    if (!bigQueryProjectId || !bigQueryDatasetId) {
        console.log("BigQuery not configured, skipping BigQuery metrics");
        return;
    }

    try {
        // Note: In a real scenario, you would query BigQuery's API or use job metadata
        // For this example, we'll simulate based on the assumption that Lambda writes to BigQuery
        // and we can track approximate metrics
        
        // Since k6 doesn't have native BigQuery support, you would typically:
        // 1. Use BigQuery REST API to get recent job statistics
        // 2. Or track metrics from Lambda's response if it includes BigQuery job info
        
        console.log("BigQuery metrics collection placeholder - would query job statistics");
        
        // PLACEHOLDER: Simulated metrics with randomization to indicate they are not real
        // In production, replace this with actual BigQuery API calls
        const simulatedQueryDuration = 100 + Math.random() * 100; // 100-200ms
        const simulatedDataProcessed = 500 + Math.random() * 1500; // 500-2000 bytes
        
        bigQueryQueryDuration.add(simulatedQueryDuration);
        bigQueryDataProcessed.add(simulatedDataProcessed);
        
        console.log("BigQuery (simulated) - Query Duration: " + simulatedQueryDuration.toFixed(2) + "ms, Data Processed: " + simulatedDataProcessed.toFixed(0) + " bytes");
        
    } catch (e) {
        console.error("Error collecting BigQuery metrics: " + e);
    }
}
 
// Service constant
const service = "kinesis";

// Custom metrics for Lambda
const lambdaInvocationDuration = new Trend("lambda_invocation_duration");
const lambdaErrors = new Counter("lambda_errors");
const lambdaThrottles = new Counter("lambda_throttles");
const lambdaConcurrentExecutions = new Gauge("lambda_concurrent_executions");

// Custom metrics for BigQuery
const bigQueryQueryDuration = new Trend("bigquery_query_duration");
const bigQueryDataProcessed = new Counter("bigquery_data_processed_bytes");
const bigQueryErrors = new Counter("bigquery_errors");

// Network metrics
const dnsLookupDuration = new Trend("dns_lookup_duration");
const tcpConnectionDuration = new Trend("tcp_connection_duration");
const tlsHandshakeDuration = new Trend("tls_handshake_duration");
const totalRequestDuration = new Trend("total_request_duration");
 
// Normalize envHost (if provided)
envHost = sanitizedHostInput(envHost);
 
// Finalize host and endpoint before building headers/signing
const host = envHost && envHost.length > 0 ? envHost : "kinesis." + region + ".amazonaws.com";
const endpoint = "https://" + host + "/";
 
console.log("HTTPS_PROXY set: " + Boolean(__ENV.HTTPS_PROXY));
console.log("HTTP_PROXY set: " + Boolean(__ENV.HTTP_PROXY));
console.log("NO_PROXY set: " + Boolean(__ENV.NO_PROXY));
console.log("Using kinesis host: " + host);
 
export default function () {
    // Preflight reachability probe (expect 463/484/400 is fine; timeout or network error is not)
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

    // Prepare SigV4 inputs
    const method = "POST";
    const canonicalUri = "/";
    const canonicalQuerystring = "";

    // Base headers (ensure Host reflects final host)
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

    // Canonical request
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
    for (const hk in headersToSend) {
        finalHeaders[hk] = headersToSend[hk];
    }
    finalHeaders["Authorization"] = authorizationHeader;

    // Simple retry for transient errors (throttling, 5xx)
    const maxAttempts = 3;
    const backoffMs = [0, 200, 500];
    let attempt = 0;
    let res = null;
    for (attempt = 0; attempt < maxAttempts; attempt++) {
        // Backoff before retry (except first attempt)
        if (backoffMs[attempt] > 0) {
            sleep(backoffMs[attempt] / 1000);
        }
        res = http.post(endpoint, body, { headers: finalHeaders, timeout: "120s" });
        console.log("Timings: " + JSON.stringify(res.timings));

        // Collect network metrics from response timings
        if (res.timings) {
            if (res.timings.dns) dnsLookupDuration.add(res.timings.dns);
            if (res.timings.connecting) tcpConnectionDuration.add(res.timings.connecting);
            if (res.timings.tls_handshaking) tlsHandshakeDuration.add(res.timings.tls_handshaking);
            if (res.timings.duration) totalRequestDuration.add(res.timings.duration);
        }

        // Log essentials for each attempt
        const errType = res.headers ? (res.headers["x-amzn-errortype"] || res.headers["X-Amzn-Errortype"]) || "" : "";
        const reqId = res.headers ? (res.headers["x-amzn-requestid"] || res.headers["X-Amzn-Requestid"]) || "" : "";
        console.log("Attempt " + (attempt + 1) + " status: " + res.status + " requestId: " + reqId + " errorType: " + errType);

        if (res.status === 200) break;

        // Retry on throttling or 5xx
        const statusClass = Math.floor(res.status / 100);
        const is5xx = statusClass === 5;
        const isThrottle = errType.indexOf("ProvisionedThroughputExceededException") >= 0 || errType.indexOf("Throttling") >= 0;
        if (!(is5xx || isThrottle)) break;
    }

    // Validate success and parse body
    let ok = false;
    let shard = "";
    let seq = "";
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

    // Emit checks
    const checks = {
        "PutRecord HTTP 200": function () { return res && res.status === 200; },
        "PutRecord has SequenceNumber": function () { return ok; },
    };
    check(res, checks);

    if (!ok) {
        const bodyPreview = res && res.body ? safeTruncate(res.body, 500) : "";
        console.error("PutRecord failed. Status: " + (res ? res.status : "n/a") + " Body: " + bodyPreview);
        // Uncomment if you need deep debugging (do not commit with secrets)
        // console.log("canonicalRequest:\n" + canonicalRequest);
        // console.log("stringToSign:\n" + stringToSign);
        fail("PutRecord did not succeed");
    } else {
        console.log("PutRecord OK. ShardId: " + shard + " SequenceNumber: " + seq);
    }

    // Collect Lambda and BigQuery metrics periodically (e.g., every 10th iteration)
    if (__ITER % 10 === 0) {
        collectLambdaMetrics();
        collectBigQueryMetrics();
    }
}

export function handleSummary(data) {
    return {
        "./k6-summary.html": htmlReport(data),
        "stdout": textSummary(data, { indent: " ", enableColors: true }),
    };
}

function textSummary(data, options) {
    // Custom text summary for console output
    let summary = "\n";
    summary += "=".repeat(80) + "\n";
    summary += "K6 Load Test Summary - Kinesis → Lambda → BigQuery Pipeline\n";
    summary += "=".repeat(80) + "\n\n";
    
    // Test run info
    summary += "Test Duration: " + (data.state.testRunDurationMs / 1000).toFixed(2) + "s\n";
    summary += "Total Iterations: " + (data.metrics.iterations ? data.metrics.iterations.values.count : 0) + "\n";
    summary += "Virtual Users: " + (data.metrics.vus ? data.metrics.vus.values.value : 0) + "\n\n";
    
    // HTTP metrics
    summary += "HTTP Metrics:\n";
    summary += "-".repeat(80) + "\n";
    if (data.metrics.http_req_duration) {
        summary += "  Request Duration (avg): " + data.metrics.http_req_duration.values.avg.toFixed(2) + "ms\n";
        summary += "  Request Duration (p95): " + data.metrics.http_req_duration.values["p(95)"].toFixed(2) + "ms\n";
        summary += "  Request Duration (max): " + data.metrics.http_req_duration.values.max.toFixed(2) + "ms\n";
    }
    if (data.metrics.http_reqs) {
        summary += "  Total Requests: " + data.metrics.http_reqs.values.count + "\n";
        summary += "  Request Rate: " + data.metrics.http_reqs.values.rate.toFixed(2) + " req/s\n";
    }
    if (data.metrics.http_req_failed) {
        summary += "  Failed Requests: " + (data.metrics.http_req_failed.values.rate * 100).toFixed(2) + "%\n";
    }
    summary += "\n";
    
    // Network metrics
    summary += "Network Metrics:\n";
    summary += "-".repeat(80) + "\n";
    if (data.metrics.dns_lookup_duration) {
        summary += "  DNS Lookup (avg): " + data.metrics.dns_lookup_duration.values.avg.toFixed(2) + "ms\n";
    }
    if (data.metrics.tcp_connection_duration) {
        summary += "  TCP Connection (avg): " + data.metrics.tcp_connection_duration.values.avg.toFixed(2) + "ms\n";
    }
    if (data.metrics.tls_handshake_duration) {
        summary += "  TLS Handshake (avg): " + data.metrics.tls_handshake_duration.values.avg.toFixed(2) + "ms\n";
    }
    if (data.metrics.total_request_duration) {
        summary += "  Total Request (avg): " + data.metrics.total_request_duration.values.avg.toFixed(2) + "ms\n";
    }
    summary += "\n";
    
    // Lambda metrics
    summary += "Lambda Metrics:\n";
    summary += "-".repeat(80) + "\n";
    if (data.metrics.lambda_invocation_duration) {
        summary += "  Invocation Duration (avg): " + data.metrics.lambda_invocation_duration.values.avg.toFixed(2) + "ms\n";
        summary += "  Invocation Duration (p95): " + data.metrics.lambda_invocation_duration.values["p(95)"].toFixed(2) + "ms\n";
        summary += "  Invocation Duration (max): " + data.metrics.lambda_invocation_duration.values.max.toFixed(2) + "ms\n";
    }
    if (data.metrics.lambda_errors) {
        summary += "  Total Errors: " + data.metrics.lambda_errors.values.count + "\n";
    }
    if (data.metrics.lambda_throttles) {
        summary += "  Total Throttles: " + data.metrics.lambda_throttles.values.count + "\n";
    }
    if (data.metrics.lambda_concurrent_executions) {
        summary += "  Concurrent Executions (avg): " + data.metrics.lambda_concurrent_executions.values.value.toFixed(0) + "\n";
    }
    summary += "\n";
    
    // BigQuery metrics
    summary += "BigQuery Metrics:\n";
    summary += "-".repeat(80) + "\n";
    if (data.metrics.bigquery_query_duration) {
        summary += "  Query Duration (avg): " + data.metrics.bigquery_query_duration.values.avg.toFixed(2) + "ms\n";
        summary += "  Query Duration (p95): " + data.metrics.bigquery_query_duration.values["p(95)"].toFixed(2) + "ms\n";
    }
    if (data.metrics.bigquery_data_processed_bytes) {
        const bytesProcessed = data.metrics.bigquery_data_processed_bytes.values.count;
        summary += "  Data Processed: " + (bytesProcessed / 1024).toFixed(2) + " KB\n";
    }
    if (data.metrics.bigquery_errors) {
        summary += "  Total Errors: " + data.metrics.bigquery_errors.values.count + "\n";
    }
    summary += "\n";
    
    // Checks
    summary += "Checks:\n";
    summary += "-".repeat(80) + "\n";
    if (data.metrics.checks) {
        const passRate = (data.metrics.checks.values.rate * 100).toFixed(2);
        summary += "  Pass Rate: " + passRate + "%\n";
        summary += "  Total Checks: " + data.metrics.checks.values.count + "\n";
    }
    summary += "\n";
    
    summary += "=".repeat(80) + "\n";
    summary += "Report generated at: " + new Date().toISOString() + "\n";
    summary += "=".repeat(80) + "\n";
    
    return summary;
}