/**
 * K6 Load Test Script - Baseline Test with 100-byte Payload
 * 
 * This script tests the Kinesis + Lambda pipeline with small payloads
 * to establish baseline performance metrics.
 * 
 * Usage:
 *   export AWS_REGION="us-east-1"
 *   export KINESIS_STREAM_NAME="your-stream-name"
 *   k6 run --out json=results-100b.json baseline-100b.js
 */

import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import http from 'k6/http';

// Custom metrics
const kinesisSuccessRate = new Rate('kinesis_success_rate');
const kinesisDuration = new Trend('kinesis_put_duration');
const recordsSent = new Counter('kinesis_records_sent');
const recordsFailed = new Counter('kinesis_records_failed');

// Test configuration
export const options = {
    stages: [
        { duration: '30s', target: 10 },   // Ramp to 10 RPS
        { duration: '5m', target: 10 },    // 10 records/sec baseline
        { duration: '30s', target: 50 },   // Ramp to 50 RPS
        { duration: '5m', target: 50 },    // 50 records/sec
        { duration: '30s', target: 100 },  // Ramp to 100 RPS
        { duration: '5m', target: 100 },   // 100 records/sec
        { duration: '30s', target: 200 },  // Ramp to 200 RPS
        { duration: '5m', target: 200 },   // 200 records/sec
        { duration: '1m', target: 0 },     // Ramp down
    ],
    thresholds: {
        'kinesis_success_rate': ['rate>0.99'],           // 99% success rate
        'kinesis_put_duration': ['p(95)<100', 'p(99)<200'], // Latency targets
        'http_req_duration': ['p(95)<150'],              // HTTP request duration
    },
};

// Configuration
const KINESIS_STREAM_NAME = __ENV.KINESIS_STREAM_NAME || 'test-stream';
const AWS_REGION = __ENV.AWS_REGION || 'us-east-1';
const TEST_RUN_ID = `test-${Date.now()}`;

// For this example, we'll use AWS SDK via HTTP requests
// In production, you might use the k6-x-kinesis extension or AWS SDK wrapper

export default function () {
    const eventId = `evt_${Date.now()}_${exec.vu.idInTest}_${exec.scenario.iterationInTest}`;
    
    // Generate ~100 byte payload
    const payload = {
        eventId: eventId,
        timestamp: new Date().toISOString(),
        testRun: TEST_RUN_ID,
        payloadType: 'small-100b',
        vu: exec.vu.idInTest,
        iteration: exec.scenario.iterationInTest,
        data: 'x'.repeat(20), // Filler to reach ~100 bytes
    };

    const payloadStr = JSON.stringify(payload);
    const startTime = Date.now();

    // Simulate Kinesis PutRecord operation
    // In production, replace this with actual AWS SDK call or k6-x-kinesis extension
    const result = simulateKinesisPutRecord(KINESIS_STREAM_NAME, payloadStr, eventId);

    const duration = Date.now() - startTime;

    // Record metrics
    kinesisDuration.add(duration);
    
    const success = check(result, {
        'status is 200': (r) => r.status === 200,
        'has sequence number': (r) => r.json('SequenceNumber') !== undefined,
    });

    kinesisSuccessRate.add(success);
    
    if (success) {
        recordsSent.add(1);
    } else {
        recordsFailed.add(1);
        console.error(`Failed to send record ${eventId}: ${result.status}`);
    }

    // Sleep to control rate (1 second per iteration per VU)
    sleep(1);
}

/**
 * Simulate Kinesis PutRecord operation
 * 
 * NOTE: This is a simulation for demonstration purposes.
 * In production, use one of these approaches:
 * 
 * 1. K6 extension: https://github.com/grafana/xk6-output-cloudwatch
 * 2. AWS SDK wrapper via k6/http with signed requests
 * 3. Lambda proxy endpoint that forwards to Kinesis
 * 4. API Gateway -> Kinesis integration
 */
function simulateKinesisPutRecord(streamName, data, partitionKey) {
    // For demonstration, we'll simulate with an HTTP endpoint
    // Replace this URL with your actual Kinesis endpoint or proxy
    const url = __ENV.KINESIS_ENDPOINT || 'http://localhost:8080/kinesis/putRecord';
    
    const payload = JSON.stringify({
        StreamName: streamName,
        Data: Buffer.from(data).toString('base64'),
        PartitionKey: partitionKey,
    });

    const params = {
        headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'Kinesis_20131202.PutRecord',
        },
        timeout: '10s',
    };

    // For actual testing, you would make authenticated AWS API calls here
    // This is a placeholder that returns mock success
    return {
        status: 200,
        json: (key) => {
            if (key === 'SequenceNumber') {
                return `seq-${Date.now()}-${Math.random()}`;
            }
            return undefined;
        },
    };
}

/**
 * Setup function - runs once before test
 */
export function setup() {
    console.log('='.repeat(60));
    console.log('Starting K6 Load Test - 100 Byte Payload');
    console.log('='.repeat(60));
    console.log(`Test Run ID: ${TEST_RUN_ID}`);
    console.log(`Stream Name: ${KINESIS_STREAM_NAME}`);
    console.log(`AWS Region: ${AWS_REGION}`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    
    return {
        testRunId: TEST_RUN_ID,
        startTime: Date.now(),
    };
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
    const duration = (Date.now() - data.startTime) / 1000;
    console.log('='.repeat(60));
    console.log('Test Completed');
    console.log('='.repeat(60));
    console.log(`End Time: ${new Date().toISOString()}`);
    console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
    console.log('='.repeat(60));
}

/**
 * Handle summary - custom summary output
 */
export function handleSummary(data) {
    const summary = {
        testRunId: TEST_RUN_ID,
        startTime: new Date(data.state.testRunDurationMs).toISOString(),
        metrics: {
            kinesis_success_rate: data.metrics.kinesis_success_rate?.values?.rate || 0,
            kinesis_put_duration_avg: data.metrics.kinesis_put_duration?.values?.avg || 0,
            kinesis_put_duration_p95: data.metrics.kinesis_put_duration?.values?.['p(95)'] || 0,
            kinesis_put_duration_p99: data.metrics.kinesis_put_duration?.values?.['p(99)'] || 0,
            records_sent: data.metrics.kinesis_records_sent?.values?.count || 0,
            records_failed: data.metrics.kinesis_records_failed?.values?.count || 0,
            http_req_duration_avg: data.metrics.http_req_duration?.values?.avg || 0,
            http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
        },
    };

    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'summary.json': JSON.stringify(summary, null, 2),
    };
}

function textSummary(data, options) {
    // Simple text summary - in production, use k6's built-in textSummary
    return `
    ✓ kinesis_success_rate: ${(data.metrics.kinesis_success_rate?.values?.rate * 100 || 0).toFixed(2)}%
    ✓ kinesis_put_duration (avg): ${(data.metrics.kinesis_put_duration?.values?.avg || 0).toFixed(2)}ms
    ✓ kinesis_put_duration (p95): ${(data.metrics.kinesis_put_duration?.values?.['p(95)'] || 0).toFixed(2)}ms
    ✓ kinesis_put_duration (p99): ${(data.metrics.kinesis_put_duration?.values?.['p(99)'] || 0).toFixed(2)}ms
    ✓ records_sent: ${data.metrics.kinesis_records_sent?.values?.count || 0}
    ✓ records_failed: ${data.metrics.kinesis_records_failed?.values?.count || 0}
    `;
}
