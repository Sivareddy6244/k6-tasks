# Quick Reference: K6 Testing Plan Summary

## Test Scenarios at a Glance

### Payload Sizes Summary

| Payload Size | Typical Use Case | Example Data | Target P95 Latency |
|--------------|------------------|--------------|-------------------|
| 100 bytes | IoT sensors, simple events | `{"id":"123","ts":"...","val":42}` | < 100ms |
| 500 bytes | Standard API events | User actions, page views | < 150ms |
| 1 KB | Transaction logs | Detailed event records | < 200ms |
| 5 KB | Complex nested data | Aggregated analytics | < 300ms |
| 10 KB | Near maximum size | Batch events, file metadata | < 500ms |

### Load Levels Summary

| Load Level | RPS | Daily Volume | When to Use | Expected Behavior |
|------------|-----|--------------|-------------|-------------------|
| Baseline | 10 | 864K | Initial testing | Establish performance floor |
| Low | 50 | 4.32M | Light load | Test basic scaling |
| Medium | 100 | 8.64M | Moderate load | Realistic production |
| High | 200 | 17.28M | Heavy load | Peak hours simulation |
| Peak | 500 | 43.2M | Maximum normal | Capacity planning |
| Stress | 1,000 | 86.4M | Stress testing | Find breaking points |
| Maximum | 2,000+ | 172.8M+ | Capacity limits | Identify failure modes |

### Test Schedule (4 Weeks)

| Week | Phase | Tests | Duration | Key Deliverable |
|------|-------|-------|----------|-----------------|
| 1 | Baseline | 100B, 500B, 1KB at varying loads | 5 hours | Performance baseline report |
| 2 | Sustained | 30-min sustained + variable patterns | 4 hours | Stability confirmation |
| 3 | Stress & Spike | Gradual stress + spike tests | 6 hours | Breaking point analysis |
| 4 | Endurance | 24-hour test + large payloads | 26 hours | Long-term stability report |

## Critical Metrics Quick Reference

### Top 6 Priority Metrics

| # | Metric | What It Shows | Good Value | Bad Value | Action if Bad |
|---|--------|---------------|------------|-----------|---------------|
| 1 | IteratorAgeMilliseconds | Processing lag | < 1000ms | > 60000ms | Scale Lambda or increase shards |
| 2 | Lambda Duration | Processing time | < 50% timeout | > 80% timeout | Optimize code or increase memory |
| 3 | Lambda Errors | Failure rate | < 0.1% | > 1% | Check logs, fix bugs |
| 4 | Throttles | Capacity issues | 0 | Any > 0 | Increase capacity limits |
| 5 | Throughput Match | Data flow | IncomingRecords ≈ Invocations | Gap > 10% | Check event source mapping |
| 6 | RecordProcessingLatency | End-to-end time | < 2000ms | > 5000ms | Optimize pipeline stages |

### All Metrics Categories

| Category | # of Metrics | Priority | Tools |
|----------|--------------|----------|-------|
| Kinesis Stream | 10 metrics | High | CloudWatch |
| Lambda Execution | 8 metrics | High | CloudWatch |
| End-to-End Pipeline | 7 metrics | Medium | Custom CloudWatch |
| Cost Tracking | 4 metrics | Medium | Cost Explorer |
| K6 Load Testing | 4 metrics | High | K6 output |

## K6 Test Scripts Quick Reference

### Available Scripts

| Script | Payload | Pattern | Duration | Use Case |
|--------|---------|---------|----------|----------|
| `baseline-100b.js` | 100B | 10→50→100→200 RPS | ~25 min | Baseline small payload |
| `baseline-500b.js` | 500B | 10→50→100→200 RPS | ~25 min | **Primary baseline** |
| `spike-test.js` | 500B | 50→500→50 RPS | ~14 min | Resilience testing |

### Quick Commands

```bash
# Setup
export AWS_REGION="us-east-1"
export KINESIS_STREAM_NAME="your-stream-name"

# Run baseline test
k6 run --out json=results-500b.json k6-test-scripts/baseline-500b.js

# Run spike test
k6 run --out json=results-spike.json k6-test-scripts/spike-test.js

# Quick 30-second test (development)
k6 run --vus 10 --duration 30s k6-test-scripts/baseline-100b.js
```

## Success Criteria Quick Reference

### Test Pass/Fail Criteria

| Test Type | Success Rate | P95 Latency | Throttles | Iterator Age |
|-----------|-------------|-------------|-----------|--------------|
| Baseline (100B) | > 99% | < 100ms | 0 | < 1000ms |
| Baseline (500B) | > 99% | < 150ms | 0 | < 1500ms |
| Baseline (1KB) | > 99% | < 200ms | 0 | < 2000ms |
| Sustained Load | > 99% | Stable | 0 | < 2000ms |
| Spike Test | > 95% | < 300ms | < 10 | < 5000ms |
| Stress Test | > 90% | < 500ms | Document | Document |

### Red Flags 🚨

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Success rate < 95% | Capacity issue | Increase shards/Lambda concurrency |
| Iterator age growing | Falling behind | Increase Lambda memory/concurrency |
| High throttles | Over capacity | Increase provisioned throughput |
| Increasing latency | Bottleneck | Check downstream services |
| Lambda errors > 1% | Code issue | Check logs, fix bugs |
| Cold starts > 5% | Scaling too slow | Consider provisioned concurrency |

## Cost Estimation Quick Reference

### Estimated Testing Costs

| Component | Unit Cost | Week 1 | Week 2 | Week 3 | Week 4 | Total |
|-----------|-----------|--------|--------|--------|--------|-------|
| K6 EC2 (t3.large) | $0.08/hr | $0.40 | $0.32 | $0.48 | $2.08 | $3.28 |
| Kinesis (2 shards) | $0.015/hr | $0.08 | $0.06 | $0.09 | $0.36 | $0.59 |
| Lambda Requests | $0.20/1M | $0.50 | $0.40 | $0.80 | $1.00 | $2.70 |
| CloudWatch | Fixed | $2 | $2 | $2 | $2 | $8.00 |
| **Total** | | **$2.98** | **$2.78** | **$3.37** | **$5.44** | **~$15** |

### Production Cost (Monthly, per RPS)

| Load (RPS) | Daily Volume | Kinesis Cost | Lambda Cost | Total/Month |
|------------|--------------|--------------|-------------|-------------|
| 10 | 864K | $21.60 | $5.18 | ~$27 |
| 50 | 4.32M | $21.60 | $25.92 | ~$48 |
| 100 | 8.64M | $43.20 | $51.84 | ~$95 |
| 500 | 43.2M | $108.00 | $259.20 | ~$367 |
| 1000 | 86.4M | $216.00 | $518.40 | ~$734 |

*Estimates based on 100ms Lambda duration, 512MB memory, 2KB avg payload*

## Team Collaboration Quick Reference

### Questions to Ask Other Teams

1. **K6 Setup**: Where do you run k6? (EC2, local, CI/CD?)
2. **Metrics**: What output format? (JSON, InfluxDB, CloudWatch?)
3. **Visualization**: How do you view results? (Grafana, K6 Cloud, custom?)
4. **Thresholds**: What success criteria do you use?
5. **Test Duration**: How long do you run each test?
6. **Cost**: What's your monthly testing budget?

### Information to Share with Manager

**Quick Wins** (Can start immediately):
- ✅ All documentation complete
- ✅ Test scripts ready to run
- ✅ CloudWatch dashboard template ready
- ✅ Clear 4-week timeline

**Needs from Manager**:
- [ ] Expected production load (RPS)
- [ ] Test environment details
- [ ] Budget approval (~$15 for testing)
- [ ] Timeline expectations
- [ ] Team assignments

**Expected Outcomes**:
- Performance baseline within 1 week
- Bottleneck identification within 2 weeks
- Optimization recommendations within 3 weeks
- Production-ready configuration within 4 weeks

## CloudWatch Dashboard Quick Deploy

```bash
# Replace placeholders
LAMBDA_NAME="your-lambda-function"
REGION="us-east-1"

# Deploy dashboard
sed -i "s/YOUR_LAMBDA_FUNCTION_NAME/$LAMBDA_NAME/g" cloudwatch-dashboards/pipeline-overview.json
aws cloudwatch put-dashboard \
  --dashboard-name "Kinesis-Lambda-Performance" \
  --dashboard-body file://cloudwatch-dashboards/pipeline-overview.json \
  --region $REGION

# View dashboard
echo "https://console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=Kinesis-Lambda-Performance"
```

## Next Steps Checklist

### Today (Pre-Meeting)
- [ ] Read [PERFORMANCE_TESTING_README.md](./PERFORMANCE_TESTING_README.md)
- [ ] Review this quick reference
- [ ] Understand the 3 key points for your manager
- [ ] Prepare questions for the manager

### Tomorrow (After Meeting)
- [ ] Get production load requirements from manager
- [ ] Set up test environment (Kinesis + Lambda)
- [ ] Deploy CloudWatch dashboard
- [ ] Install K6
- [ ] Run first baseline test

### Week 1
- [ ] Complete all baseline tests (100B, 500B, 1KB)
- [ ] Document baseline performance
- [ ] Identify initial optimizations
- [ ] Share results with team

## Contact & Support

- **K6 Docs**: https://k6.io/docs/
- **AWS Kinesis Docs**: https://docs.aws.amazon.com/kinesis/
- **AWS Lambda Docs**: https://docs.aws.amazon.com/lambda/
- **This Repository**: See README.md for full documentation

---

**Last Updated**: October 30, 2025
