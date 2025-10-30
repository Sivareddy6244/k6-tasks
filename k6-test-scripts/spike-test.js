/**
 * K6 Load Test Script - Spike Test
 * 
 * This script simulates a sudden traffic spike to test system resilience
 * and auto-scaling capabilities.
 * 
 * Usage:
 *   export AWS_REGION="us-east-1"
 *   export KINESIS_STREAM_NAME="your-stream-name"
 *   k6 run --out json=results-spike.json spike-test.js
 */

import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import exec from 'k6/execution';

// Custom metrics
const kinesisSuccessRate = new Rate('kinesis_success_rate');
const kinesisDuration = new Trend('kinesis_put_duration');
const recordsSent = new Counter('kinesis_records_sent');
const recordsFailed = new Counter('kinesis_records_failed');
const currentVUs = new Gauge('current_vus');

// Test configuration - Spike pattern
export const options = {
    stages: [
        { duration: '2m', target: 50 },    // Normal load
        { duration: '30s', target: 500 },  // Sudden spike to 10x
        { duration: '5m', target: 500 },   // Maintain spike
        { duration: '30s', target: 50 },   // Return to normal
        { duration: '5m', target: 50 },    // Recovery period
        { duration: '30s', target: 0 },    // Ramp down
    ],
    thresholds: {
        'kinesis_success_rate': ['rate>0.95'],  // More lenient during spike
        'kinesis_put_duration': ['p(95)<300', 'p(99)<500'],
        'http_req_duration': ['p(95)<400'],
    },
};

const KINESIS_STREAM_NAME = __ENV.KINESIS_STREAM_NAME || 'test-stream';
const AWS_REGION = __ENV.AWS_REGION || 'us-east-1';
const TEST_RUN_ID = `spike-test-${Date.now()}`;

export default function () {
    const eventId = `evt_${Date.now()}_${exec.vu.idInTest}_${exec.scenario.iterationInTest}`;
    
    // Medium payload for spike test
    const payload = {
        eventId: eventId,
        timestamp: new Date().toISOString(),
        testRun: TEST_RUN_ID,
        testType: 'spike',
        phase: getCurrentSpikePhase(),
        vu: exec.vu.idInTest,
        iteration: exec.scenario.iterationInTest,
        data: generateRealisticData(),
    };

    const payloadStr = JSON.stringify(payload);
    currentVUs.add(exec.vu.idInTest);

    const startTime = Date.now();
    const result = simulateKinesisPutRecord(KINESIS_STREAM_NAME, payloadStr, eventId);
    const duration = Date.now() - startTime;

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
        
        // Log failures during spike for analysis
        if (getCurrentSpikePhase() === 'spike') {
            console.warn(`SPIKE FAILURE - Record ${eventId}: ${result.status}`);
        }
    }

    sleep(1);
}

function getCurrentSpikePhase() {
    const elapsed = Date.now() - __ENV.START_TIME || 0;
    
    if (elapsed < 120000) return 'normal-baseline';
    if (elapsed < 150000) return 'ramping-spike';
    if (elapsed < 450000) return 'spike';
    if (elapsed < 480000) return 'ramping-normal';
    if (elapsed < 780000) return 'recovery';
    return 'ramp-down';
}

function generateRealisticData() {
    return {
        transaction_id: `txn_${Math.random().toString(36).substr(2, 9)}`,
        amount: Math.floor(Math.random() * 10000) / 100,
        currency: 'USD',
        status: ['pending', 'completed', 'failed'][Math.floor(Math.random() * 3)],
        details: 'x'.repeat(200), // Filler
    };
}

function simulateKinesisPutRecord(streamName, data, partitionKey) {
    // Placeholder - replace with actual Kinesis call
    // During spike, simulate occasional throttling
    const phase = getCurrentSpikePhase();
    const failureRate = phase === 'spike' ? 0.05 : 0.01; // 5% failure during spike
    
    if (Math.random() < failureRate) {
        return {
            status: 429, // Throttled
            json: () => undefined,
        };
    }
    
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
    const startTime = Date.now();
    __ENV.START_TIME = startTime;
    
    console.log('='.repeat(60));
    console.log('Starting K6 Spike Test');
    console.log('='.repeat(60));
    console.log(`Test Run ID: ${TEST_RUN_ID}`);
    console.log(`Stream Name: ${KINESIS_STREAM_NAME}`);
    console.log(`AWS Region: ${AWS_REGION}`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    console.log('');
    console.log('Test Pattern:');
    console.log('  0-2min:   50 RPS (normal)');
    console.log('  2-2.5min: 50→500 RPS (spike ramp)');
    console.log('  2.5-7.5min: 500 RPS (spike sustained)');
    console.log('  7.5-8min: 500→50 RPS (return to normal)');
    console.log('  8-13min:  50 RPS (recovery)');
    console.log('='.repeat(60));
    
    return {
        testRunId: TEST_RUN_ID,
        startTime: startTime,
    };
}

export function teardown(data) {
    const duration = (Date.now() - data.startTime) / 1000;
    console.log('='.repeat(60));
    console.log('Spike Test Completed');
    console.log('='.repeat(60));
    console.log(`End Time: ${new Date().toISOString()}`);
    console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
    console.log('='.repeat(60));
    console.log('');
    console.log('Next Steps:');
    console.log('1. Check CloudWatch for IteratorAge during spike');
    console.log('2. Verify Lambda auto-scaling response time');
    console.log('3. Check for any throttling errors in Kinesis');
    console.log('4. Verify system recovered to normal latency');
    console.log('='.repeat(60));
}

export function handleSummary(data) {
    const summary = {
        testRunId: TEST_RUN_ID,
        testType: 'spike',
        startTime: new Date().toISOString(),
        pattern: {
            normalLoad: '50 RPS',
            spikeLoad: '500 RPS',
            spikeMultiplier: '10x',
            spikeDuration: '5 minutes',
        },
        metrics: {
            overall: {
                success_rate: data.metrics.kinesis_success_rate?.values?.rate || 0,
                avg_duration: data.metrics.kinesis_put_duration?.values?.avg || 0,
                p95_duration: data.metrics.kinesis_put_duration?.values?.['p(95)'] || 0,
                p99_duration: data.metrics.kinesis_put_duration?.values?.['p(99)'] || 0,
                max_duration: data.metrics.kinesis_put_duration?.values?.max || 0,
                records_sent: data.metrics.kinesis_records_sent?.values?.count || 0,
                records_failed: data.metrics.kinesis_records_failed?.values?.count || 0,
            },
        },
        analysis: {
            passedThresholds: checkThresholds(data),
            recommendations: generateRecommendations(data),
        },
    };

    return {
        'summary-spike.json': JSON.stringify(summary, null, 2),
        'stdout': generateTextSummary(summary),
    };
}

function checkThresholds(data) {
    const successRate = data.metrics.kinesis_success_rate?.values?.rate || 0;
    const p95 = data.metrics.kinesis_put_duration?.values?.['p(95)'] || 0;
    
    return {
        success_rate: successRate > 0.95,
        p95_latency: p95 < 300,
    };
}

function generateRecommendations(data) {
    const recommendations = [];
    const successRate = data.metrics.kinesis_success_rate?.values?.rate || 0;
    const p95 = data.metrics.kinesis_put_duration?.values?.['p(95)'] || 0;
    
    if (successRate < 0.95) {
        recommendations.push('Consider increasing Kinesis shard count');
        recommendations.push('Review Lambda concurrency limits');
    }
    
    if (p95 > 300) {
        recommendations.push('Optimize Lambda function cold start time');
        recommendations.push('Consider provisioned concurrency for Lambda');
    }
    
    if (recommendations.length === 0) {
        recommendations.push('System handled spike well - no immediate action needed');
    }
    
    return recommendations;
}

function generateTextSummary(summary) {
    return `
Spike Test Results
${'='.repeat(60)}
Test Type: ${summary.testType}
Test ID: ${summary.testRunId}

Pattern:
  Normal Load:    ${summary.pattern.normalLoad}
  Spike Load:     ${summary.pattern.spikeLoad}
  Multiplier:     ${summary.pattern.spikeMultiplier}
  Spike Duration: ${summary.pattern.spikeDuration}

Metrics:
  Success Rate:   ${(summary.metrics.overall.success_rate * 100).toFixed(2)}%
  Avg Duration:   ${summary.metrics.overall.avg_duration.toFixed(2)}ms
  P95 Duration:   ${summary.metrics.overall.p95_duration.toFixed(2)}ms
  P99 Duration:   ${summary.metrics.overall.p99_duration.toFixed(2)}ms
  Max Duration:   ${summary.metrics.overall.max_duration.toFixed(2)}ms
  Records Sent:   ${summary.metrics.overall.records_sent}
  Records Failed: ${summary.metrics.overall.records_failed}

Thresholds:
  Success Rate:   ${summary.analysis.passedThresholds.success_rate ? '✓' : '✗'} (target: >95%)
  P95 Latency:    ${summary.analysis.passedThresholds.p95_latency ? '✓' : '✗'} (target: <300ms)

Recommendations:
${summary.analysis.recommendations.map(r => `  • ${r}`).join('\n')}

${'='.repeat(60)}
    `.trim();
}
