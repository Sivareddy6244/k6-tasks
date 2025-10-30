# Performance Testing Plan for Kinesis + Lambda Pipeline

## 3. Comprehensive Performance Testing Plan

### Executive Summary
This plan outlines a systematic approach to performance testing our Kinesis + Lambda pipeline with varying payload sizes and data volumes. The goal is to identify performance characteristics, bottlenecks, and optimal configurations under different load conditions.

---

## 3.1 Test Scenarios Overview

### Payload Size Variations
We will test with the following payload sizes to understand how data size affects performance:

| Scenario | Payload Size | Description | Use Case |
|----------|-------------|-------------|----------|
| Small | 100 bytes | Minimal JSON message | IoT sensors, simple events |
| Medium | 500 bytes | Standard event data | API events, user actions |
| Large | 1 KB | Detailed records | Transaction logs, enriched events |
| Very Large | 5 KB | Complex nested JSON | Aggregated data, detailed logs |
| Maximum | 10 KB | Near Kinesis limit (1 MB) | Batch events, file metadata |

### Load Volume Variations
For each payload size, we'll test different throughput levels:

| Load Level | Records/Second | Records/Minute | Daily Volume | Description |
|------------|----------------|----------------|--------------|-------------|
| Baseline | 10 | 600 | 864K | Normal operation |
| Low | 50 | 3,000 | 4.32M | Light load |
| Medium | 100 | 6,000 | 8.64M | Moderate load |
| High | 200 | 12,000 | 17.28M | Heavy load |
| Peak | 500 | 30,000 | 43.2M | Peak hours |
| Stress | 1,000 | 60,000 | 86.4M | Stress testing |
| Maximum | 2,000+ | 120,000+ | 172.8M+ | Capacity limits |

---

## 3.2 Detailed Test Plan

### Phase 1: Baseline Performance Testing (Week 1)

#### Test 1.1: Small Payload (100 bytes)
**Objective:** Establish baseline performance with minimal payload

**Configuration:**
- Payload Size: 100 bytes
- Load Profile: 10 → 50 → 100 → 200 records/second
- Duration: 5 minutes per level
- Ramp-up: 30 seconds between levels

**K6 Script:**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { AWSConfig, KinesisClient } from 'k6/x/kinesis';

// Custom metrics
const kinesisSuccessRate = new Rate('kinesis_success_rate');
const kinesisDuration = new Trend('kinesis_put_duration');
const recordsSent = new Counter('kinesis_records_sent');

export const options = {
    stages: [
        { duration: '30s', target: 10 },   // Ramp to 10 VUs
        { duration: '5m', target: 10 },    // 10 records/sec
        { duration: '30s', target: 50 },   // Ramp to 50 VUs
        { duration: '5m', target: 50 },    // 50 records/sec
        { duration: '30s', target: 100 },  // Ramp to 100 VUs
        { duration: '5m', target: 100 },   // 100 records/sec
        { duration: '30s', target: 200 },  // Ramp to 200 VUs
        { duration: '5m', target: 200 },   // 200 records/sec
        { duration: '1m', target: 0 },     // Ramp down
    ],
    thresholds: {
        'kinesis_success_rate': ['rate>0.99'],
        'kinesis_put_duration': ['p(95)<100', 'p(99)<200'],
    },
};

const config = new AWSConfig({
    region: __ENV.AWS_REGION || 'us-east-1',
});

const kinesis = new KinesisClient(config);
const streamName = __ENV.KINESIS_STREAM_NAME;

export default function () {
    const payload = {
        eventId: `evt_${Date.now()}_${__VU}_${__ITER}`,
        timestamp: new Date().toISOString(),
        data: 'x'.repeat(50), // ~100 bytes total
        testRun: 'small-payload-test',
    };

    const startTime = Date.now();
    
    const result = kinesis.putRecord({
        StreamName: streamName,
        Data: JSON.stringify(payload),
        PartitionKey: `partition_${__VU}`,
    });

    const duration = Date.now() - startTime;
    
    kinesisDuration.add(duration);
    kinesisSuccessRate.add(result.status === 'success');
    recordsSent.add(1);

    sleep(1); // 1 record per second per VU
}
```

**Metrics to Collect:**
- Kinesis: IncomingRecords, IncomingBytes, PutRecord.Latency, WriteProvisionedThroughputExceeded
- Lambda: Invocations, Duration, Errors, Throttles, IteratorAge, ConcurrentExecutions
- Custom: RecordProcessingLatency, SuccessRate, ThroughputRate
- K6: kinesis_put_duration (p50, p95, p99), kinesis_success_rate

**Success Criteria:**
- ✅ Success rate > 99%
- ✅ P95 latency < 100ms
- ✅ No throttling errors
- ✅ Lambda iterator age < 1000ms

---

#### Test 1.2: Medium Payload (500 bytes)
**Objective:** Test with standard event size

**Configuration:**
- Payload Size: 500 bytes
- Load Profile: Same as Test 1.1
- Duration: 5 minutes per level

**Payload Adjustment:**
```javascript
const payload = {
    eventId: `evt_${Date.now()}_${__VU}_${__ITER}`,
    timestamp: new Date().toISOString(),
    userId: `user_${Math.floor(Math.random() * 10000)}`,
    sessionId: `session_${Math.floor(Math.random() * 1000)}`,
    action: 'page_view',
    metadata: {
        page: '/home',
        referrer: 'https://example.com',
        userAgent: 'Mozilla/5.0...',
    },
    data: 'x'.repeat(300), // ~500 bytes total
    testRun: 'medium-payload-test',
};
```

**Metrics to Collect:** Same as Test 1.1

**Success Criteria:**
- ✅ Success rate > 99%
- ✅ P95 latency < 150ms (accounting for larger payload)
- ✅ No throttling errors
- ✅ Lambda iterator age < 1500ms

---

#### Test 1.3: Large Payload (1 KB)
**Configuration:**
- Payload Size: 1 KB
- Load Profile: 10 → 50 → 100 → 200 records/second

**Payload Adjustment:**
```javascript
const payload = {
    eventId: `evt_${Date.now()}_${__VU}_${__ITER}`,
    timestamp: new Date().toISOString(),
    data: 'x'.repeat(900), // ~1 KB total
    testRun: 'large-payload-test',
};
```

**Success Criteria:**
- ✅ Success rate > 99%
- ✅ P95 latency < 200ms
- ✅ Lambda duration < 3000ms

---

### Phase 2: Sustained Load Testing (Week 2)

#### Test 2.1: 30-Minute Sustained Load
**Objective:** Verify system stability under sustained load

**Configuration:**
- Payload Size: 500 bytes (standard)
- Load: Constant 100 records/second
- Duration: 30 minutes

**K6 Script Adjustment:**
```javascript
export const options = {
    stages: [
        { duration: '2m', target: 100 },  // Ramp up
        { duration: '30m', target: 100 }, // Sustained load
        { duration: '2m', target: 0 },    // Ramp down
    ],
};
```

**Metrics to Monitor:**
- Memory utilization trends
- CPU utilization trends
- IteratorAge stability
- Error rate over time

**Success Criteria:**
- ✅ Zero degradation over 30 minutes
- ✅ Stable latency (no drift)
- ✅ Consistent throughput
- ✅ Error rate < 0.1%

---

#### Test 2.2: Variable Load Pattern
**Objective:** Simulate real-world traffic patterns

**Configuration:**
```javascript
export const options = {
    stages: [
        { duration: '5m', target: 50 },   // Morning light traffic
        { duration: '5m', target: 150 },  // Morning peak
        { duration: '5m', target: 80 },   // Mid-day
        { duration: '5m', target: 200 },  // Afternoon peak
        { duration: '5m', target: 100 },  // Evening
        { duration: '5m', target: 30 },   // Night
    ],
};
```

**Success Criteria:**
- ✅ Handles load variations smoothly
- ✅ Lambda scales appropriately
- ✅ No cold start issues during ramp-up

---

### Phase 3: Stress & Spike Testing (Week 3)

#### Test 3.1: Gradual Stress Test
**Objective:** Find breaking point

**Configuration:**
```javascript
export const options = {
    stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '5m', target: 500 },
        { duration: '5m', target: 1000 },
        { duration: '5m', target: 2000 },
        { duration: '2m', target: 0 },
    ],
    thresholds: {
        'kinesis_success_rate': ['rate>0.95'], // Lower threshold for stress
    },
};
```

**Metrics Focus:**
- When do throttles start?
- At what point does IteratorAge grow?
- Lambda concurrency limits reached?

**Expected Outcomes:**
- Identify maximum sustainable throughput
- Identify first point of failure
- Document graceful degradation behavior

---

#### Test 3.2: Spike Test
**Objective:** Test sudden traffic surge

**Configuration:**
```javascript
export const options = {
    stages: [
        { duration: '5m', target: 50 },    // Normal load
        { duration: '30s', target: 500 },  // Sudden spike
        { duration: '5m', target: 500 },   // Sustained spike
        { duration: '30s', target: 50 },   // Return to normal
        { duration: '5m', target: 50 },    // Recovery
    ],
};
```

**Success Criteria:**
- ✅ System handles spike without errors
- ✅ Auto-scaling responds within 2 minutes
- ✅ No data loss during spike
- ✅ System recovers to normal latency within 5 minutes

---

### Phase 4: Large Payload Testing (Week 3)

#### Test 4.1: Very Large Payload (5 KB)
**Configuration:**
- Payload Size: 5 KB
- Load: 10 → 50 → 100 records/second
- Duration: 5 minutes per level

**Expected Impact:**
- Higher Kinesis bandwidth usage
- Increased Lambda execution time
- Potential memory pressure

---

#### Test 4.2: Maximum Payload (10 KB)
**Configuration:**
- Payload Size: 10 KB
- Load: 10 → 50 records/second
- Monitor for issues

---

### Phase 5: Endurance Testing (Week 4)

#### Test 5.1: 24-Hour Endurance Test
**Objective:** Verify long-term stability

**Configuration:**
- Payload Size: 500 bytes
- Load: 50 records/second
- Duration: 24 hours

**Monitoring:**
- Check for memory leaks
- Monitor CloudWatch costs
- Verify log rotation
- Check DLQ accumulation

---

## 3.3 Test Execution Checklist

### Pre-Test Setup
- [ ] Set up CloudWatch dashboards
- [ ] Configure CloudWatch alarms
- [ ] Set up log aggregation
- [ ] Prepare test data generators
- [ ] Document baseline metrics
- [ ] Set up k6 test environment
- [ ] Configure AWS credentials
- [ ] Set up metric collection
- [ ] Create Kinesis stream with appropriate shards
- [ ] Deploy Lambda function with proper configuration
- [ ] Set up downstream services (DynamoDB, S3, etc.)

### During Test Execution
- [ ] Monitor real-time dashboards
- [ ] Record any anomalies
- [ ] Capture screenshots of metrics
- [ ] Monitor AWS service limits
- [ ] Check for error logs
- [ ] Monitor costs

### Post-Test Analysis
- [ ] Export metrics to CSV/JSON
- [ ] Generate performance report
- [ ] Identify bottlenecks
- [ ] Calculate cost per million records
- [ ] Document findings
- [ ] Create recommendations

---

## 3.4 Metrics Collection Matrix

| Test Phase | Payload Size | RPS | Duration | Key Metrics |
|------------|-------------|-----|----------|-------------|
| Phase 1.1 | 100B | 10-200 | 5min each | Baseline latency, throughput |
| Phase 1.2 | 500B | 10-200 | 5min each | Standard performance |
| Phase 1.3 | 1KB | 10-200 | 5min each | Large payload impact |
| Phase 2.1 | 500B | 100 | 30min | Stability, no degradation |
| Phase 2.2 | 500B | 30-200 | 30min | Auto-scaling, elasticity |
| Phase 3.1 | 500B | 100-2000 | 30min | Breaking point, limits |
| Phase 3.2 | 500B | 50→500→50 | 20min | Spike handling, recovery |
| Phase 4.1 | 5KB | 10-100 | 20min | Large payload performance |
| Phase 4.2 | 10KB | 10-50 | 15min | Maximum payload limits |
| Phase 5.1 | 500B | 50 | 24hr | Long-term stability |

---

## 3.5 Expected Results Template

### Performance Baseline Results
```
Test: Small Payload (100 bytes)
Date: YYYY-MM-DD
Configuration: 
  - Kinesis Shards: X
  - Lambda Memory: X MB
  - Lambda Timeout: X seconds

Results:
  Load Level: 10 RPS
    - Avg Latency: X ms
    - P95 Latency: X ms
    - P99 Latency: X ms
    - Success Rate: X%
    - Throttles: X
    - Lambda Duration: X ms
    - Iterator Age: X ms
  
  Load Level: 50 RPS
    - Avg Latency: X ms
    - P95 Latency: X ms
    ...
```

---

## 3.6 Reporting Structure

### Daily Test Report
1. **Test Summary**: What was tested, configuration
2. **Results**: Key metrics table
3. **Observations**: Notable behaviors, anomalies
4. **Issues**: Errors, throttling, failures
5. **Screenshots**: Dashboard snapshots
6. **Recommendations**: Immediate actions needed

### Weekly Summary Report
1. **Executive Summary**: High-level findings
2. **All Tests Summary**: Comparison table
3. **Performance Trends**: Graphs and charts
4. **Bottleneck Analysis**: Identified issues
5. **Cost Analysis**: Cost per million records
6. **Optimization Recommendations**: Tuning suggestions
7. **Next Steps**: Upcoming tests

---

## 3.7 Success Criteria Summary

### Overall Pipeline Health
- ✅ **Throughput**: Process target RPS without throttling
- ✅ **Latency**: End-to-end latency < 2 seconds (P95)
- ✅ **Reliability**: Success rate > 99.9%
- ✅ **Scalability**: Handle 2x peak load without errors
- ✅ **Stability**: Zero degradation over 24 hours
- ✅ **Recovery**: Return to normal within 5 minutes after spike
- ✅ **Cost**: Cost per million records within budget

### Red Flags to Watch
- 🚨 IteratorAge continuously growing (falling behind)
- 🚨 Lambda throttles occurring
- 🚨 Kinesis write/read throughput exceeded
- 🚨 Error rate > 1%
- 🚨 Lambda duration > 80% of timeout
- 🚨 DLQ messages accumulating
- 🚨 Memory utilization > 90%

---

## 3.8 Next Steps

### Immediate Actions (This Week)
1. Review this plan with the team
2. Set up test environment (Kinesis stream, Lambda, monitoring)
3. Install and configure k6
4. Create baseline k6 scripts for 100B, 500B, 1KB payloads
5. Set up CloudWatch dashboards
6. Run Phase 1.1 test (100 bytes baseline)

### Short-term (Next 2 Weeks)
1. Complete Phase 1 (all payload baseline tests)
2. Complete Phase 2 (sustained load tests)
3. Analyze results and identify initial optimizations
4. Adjust Lambda/Kinesis configurations based on findings

### Medium-term (Next Month)
1. Complete Phase 3 (stress testing)
2. Complete Phase 4 (large payload testing)
3. Complete Phase 5 (endurance testing)
4. Generate comprehensive performance report
5. Implement optimization recommendations
6. Re-run critical tests to validate improvements

---

## Appendix A: Sample K6 Complete Script

See the `k6-test-scripts/` directory for complete, production-ready k6 scripts for each test scenario.

## Appendix B: CloudWatch Dashboard Templates

See the `cloudwatch-dashboards/` directory for JSON templates to import into AWS CloudWatch.

## Appendix C: Cost Estimation

| Component | Unit Cost | 100 RPS | 500 RPS | 1000 RPS |
|-----------|-----------|---------|---------|----------|
| Kinesis Shard Hours | $0.015/hr | $X | $X | $X |
| Lambda Requests | $0.20/1M | $X | $X | $X |
| Lambda Duration | $0.0000166667/GB-sec | $X | $X | $X |
| **Total Monthly** | | **$X** | **$X** | **$X** |
