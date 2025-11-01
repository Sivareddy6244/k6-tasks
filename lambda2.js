import http from "k6/http";
import { check, fail } from "k6";
import crypto from "k6/crypto";
import encoding from "k6/encoding";

// Required: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, LAMBDA_FUNCTION_NAME
const region = __ENV.AWS_REGION;
const accessKey = __ENV.AWS_ACCESS_KEY_ID;
const secretKey = __ENV.AWS_SECRET_ACCESS_KEY;
const sessionToken = __ENV.AWS_SESSION_TOKEN;
const functionName = __ENV.LAMBDA_FUNCTION_NAME;
let envHost = __ENV.AWS_LAMBDA_HOST;

// Basic validation
if (!region) fail("Missing AWS_REGION");
if (!accessKey) fail("Missing AWS_ACCESS_KEY_ID");
if (!secretKey) fail("Missing AWS_SECRET_ACCESS_KEY");
if (!functionName) fail("Missing LAMBDA_FUNCTION_NAME");

// Helpers
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

// Service constant
const service = "lambda";

// Normalize envHost (if provided)
envHost = sanitizedHostInput(envHost);

// Finalize host and endpoint before building headers/signing
const host = envHost && envHost.length > 0 ? envHost : `lambda.${region}.amazonaws.com`;
const endpoint = `https://${host}/2015-03-31/functions/${functionName}/invocations`;

console.log("HTTPS_PROXY set: " + Boolean(__ENV.HTTPS_PROXY));
console.log("HTTP_PROXY set: " + Boolean(__ENV.HTTP_PROXY));
console.log("NO_PROXY set: " + Boolean(__ENV.NO_PROXY));
console.log("Using lambda host: " + host);

export default function () {
    // Preflight reachability probe
    const pre = http.get(`https://${host}/`, { timeout: "10s" });
    console.log("PreFlight status: " + pre.status);

    // Build Lambda payload (customize as needed)
    const record = {
        eventId: Math.floor(Math.random() * 1e12),
        type: "test",
        timestamp: new Date().toISOString(),
    };
    const body = JSON.stringify(record);

    // Prepare SigV4 inputs
    const t = nowAmz();
    const method = "POST";
    const canonicalUri = `/2015-03-31/functions/${functionName}/invocations`;
    const canonicalQuerystring = "";

    // Base headers
    const amzDate = t.amzDate;
    const dateStamp = t.dateStamp;
    const headersToSend = {
        "Content-Type": "application/json",
        "Host": host,
        "X-Amz-Date": amzDate,
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
        if (backoffMs[attempt] > 0) { }
        res = http.post(endpoint, body, { headers: finalHeaders, timeout: "120s" });
        console.log("Timings: " + JSON.stringify(res.timings));

        // Log essentials for each attempt
        const reqId = res.headers ? (res.headers["x-amzn-requestid"] || res.headers["X-Amzn-Requestid"]) || "" : "";
        console.log("Attempt " + (attempt + 1) + " status: " + res.status + " requestId: " + reqId);

        if (res.status === 200) break;
        const statusClass = Math.floor(res.status / 100);
        if (statusClass !== 5) break;
    }

    // Validate success and parse body
    let ok = false;
    try {
        if (res && res.status === 200 && res.body) {
            ok = true; // You can do more checks based on your Lambda response
        }
    } catch (e) {
        // parsing failed
    }

    // Emit checks
    const checks = {
        "Lambda HTTP 200": function () { return res && res.status === 200; },
        "Lambda response OK": function () { return ok; },
    };
    check(res, checks);

    if (!ok) {
        const bodyPreview = res && res.body ? safeTruncate(res.body, 500) : "";
        console.error("Lambda failed. Status: " + (res ? res.status : "n/a") + " Body: " + bodyPreview);
        fail("Lambda invocation did not succeed");
    } else {
        console.log("Lambda OK. Response: " + safeTruncate(res.body, 200));
    }
}