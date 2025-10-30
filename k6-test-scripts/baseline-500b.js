/**
 * K6 Load Test Script - Baseline Test with 500-byte Payload
 * 
 * This script tests the Kinesis + Lambda pipeline with medium-sized payloads
 * representing standard event data.
 * 
 * Usage:
 *   export AWS_REGION="us-east-1"
 *   export KINESIS_STREAM_NAME="your-stream-name"
 *   k6 run --out json=results-500b.json baseline-500b.js
 */

import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';

// Custom metrics
const kinesisSuccessRate = new Rate('kinesis_success_rate');
const kinesisDuration = new Trend('kinesis_put_duration');
const recordsSent = new Counter('kinesis_records_sent');
const recordsFailed = new Counter('kinesis_records_failed');
const payloadSize = new Trend('payload_size_bytes');

// Test configuration
export const options = {
    stages: [
        { duration: '30s', target: 10 },
        { duration: '5m', target: 10 },
        { duration: '30s', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        'kinesis_success_rate': ['rate>0.99'],
        'kinesis_put_duration': ['p(95)<150', 'p(99)<250'],
        'http_req_duration': ['p(95)<200'],
    },
};

// Configuration
const KINESIS_STREAM_NAME = __ENV.KINESIS_STREAM_NAME || 'test-stream';
const AWS_REGION = __ENV.AWS_REGION || 'us-east-1';
const TEST_RUN_ID = `test-${Date.now()}`;

// Sample user agents for realistic data
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)',
];

const PAGES = ['/home', '/products', '/checkout', '/profile', '/search', '/cart'];
const ACTIONS = ['page_view', 'button_click', 'form_submit', 'link_click', 'scroll'];

export default function () {
    const eventId = `evt_${Date.now()}_${exec.vu.idInTest}_${exec.scenario.iterationInTest}`;
    const userId = `user_${Math.floor(Math.random() * 10000)}`;
    const sessionId = `session_${Math.floor(Math.random() * 1000)}`;
    
    // Generate ~500 byte payload with realistic structure
    const payload = {
        eventId: eventId,
        timestamp: new Date().toISOString(),
        testRun: TEST_RUN_ID,
        payloadType: 'medium-500b',
        userId: userId,
        sessionId: sessionId,
        action: ACTIONS[Math.floor(Math.random() * ACTIONS.length)],
        metadata: {
            page: PAGES[Math.floor(Math.random() * PAGES.length)],
            referrer: 'https://example.com/ref',
            userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
            screenResolution: '1920x1080',
            language: 'en-US',
            timezone: 'America/New_York',
        },
        context: {
            vu: exec.vu.idInTest,
            iteration: exec.scenario.iterationInTest,
            testPhase: getCurrentPhase(),
        },
        // Filler data to reach ~500 bytes
        additionalData: 'x'.repeat(100),
    };

    const payloadStr = JSON.stringify(payload);
    const payloadBytes = new Blob([payloadStr]).size;
    payloadSize.add(payloadBytes);

    const startTime = Date.now();
    const result = simulateKinesisPutRecord(KINESIS_STREAM_NAME, payloadStr, eventId);
    const duration = Date.now() - startTime;

    kinesisDuration.add(duration);
    
    const success = check(result, {
        'status is 200': (r) => r.status === 200,
        'has sequence number': (r) => r.json('SequenceNumber') !== undefined,
        'payload size ~500 bytes': () => payloadBytes >= 450 && payloadBytes <= 550,
    });

    kinesisSuccessRate.add(success);
    
    if (success) {
        recordsSent.add(1);
    } else {
        recordsFailed.add(1);
        console.error(`Failed to send record ${eventId}: ${result.status}`);
    }

    sleep(1);
}

function getCurrentPhase() {
    const elapsed = exec.scenario.iterationInTest * 1000; // Rough estimate
    if (elapsed < 30000) return 'ramp-10';
    if (elapsed < 330000) return 'steady-10';
    if (elapsed < 360000) return 'ramp-50';
    if (elapsed < 660000) return 'steady-50';
    if (elapsed < 690000) return 'ramp-100';
    if (elapsed < 990000) return 'steady-100';
    if (elapsed < 1020000) return 'ramp-200';
    if (elapsed < 1320000) return 'steady-200';
    return 'ramp-down';
}

function simulateKinesisPutRecord(streamName, data, partitionKey) {
    // Placeholder - replace with actual Kinesis call
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

export function setup() {
    console.log('='.repeat(60));
    console.log('Starting K6 Load Test - 500 Byte Payload');
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

export function teardown(data) {
    const duration = (Date.now() - data.startTime) / 1000;
    console.log('='.repeat(60));
    console.log('Test Completed');
    console.log('='.repeat(60));
    console.log(`End Time: ${new Date().toISOString()}`);
    console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
    console.log('='.repeat(60));
}

export function handleSummary(data) {
    const summary = {
        testRunId: TEST_RUN_ID,
        payloadType: 'medium-500b',
        startTime: new Date().toISOString(),
        metrics: {
            kinesis_success_rate: data.metrics.kinesis_success_rate?.values?.rate || 0,
            kinesis_put_duration_avg: data.metrics.kinesis_put_duration?.values?.avg || 0,
            kinesis_put_duration_p95: data.metrics.kinesis_put_duration?.values?.['p(95)'] || 0,
            kinesis_put_duration_p99: data.metrics.kinesis_put_duration?.values?.['p(99)'] || 0,
            records_sent: data.metrics.kinesis_records_sent?.values?.count || 0,
            records_failed: data.metrics.kinesis_records_failed?.values?.count || 0,
            avg_payload_size: data.metrics.payload_size_bytes?.values?.avg || 0,
        },
    };

    return {
        'summary-500b.json': JSON.stringify(summary, null, 2),
    };
}
