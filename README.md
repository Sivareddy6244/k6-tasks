# liquibase-changes

## 📊 K6 Performance Testing Documentation for Kinesis + Lambda Pipeline

This repository contains comprehensive documentation and resources for performance testing a Kinesis + Lambda pipeline using K6.

### 🚀 Quick Start

**Start Here**: [PERFORMANCE_TESTING_README.md](./PERFORMANCE_TESTING_README.md)

This is your complete guide with executive summaries, quick start instructions, and next steps for your discussion with your manager.

---

## 📚 Documentation

### Manager Discussion Points

#### 1️⃣ [How Teams Use K6 on AWS](./k6-performance-testing-guide.md)
**Answers**: "Check with teams who use k6 against their application on AWS and how they collect performance metrics"

**Topics Covered**:
- K6 deployment options (EC2, ECS, Lambda, K6 Cloud)
- Metrics collection methods (CloudWatch, InfluxDB, Grafana, Prometheus, DataDog)
- Real-time monitoring setup
- Best practices for AWS deployments

#### 2️⃣ [Metrics for Kinesis + Lambda Pipeline](./kinesis-lambda-metrics.md)
**Answers**: "What metrics we need to collect for our kinesis+lambda pipeline"

**Topics Covered**:
- 30+ metrics categorized by component
- Priority metrics to start with
- CloudWatch implementation examples
- Alerting thresholds
- Custom metrics collection

#### 3️⃣ [Performance Testing Plan](./performance-testing-plan.md)
**Answers**: "Plan with different payload sizes (100, 200, 300, etc.) and metrics to collect"

**Topics Covered**:
- Complete 4-week testing strategy
- Payload sizes: 100B, 500B, 1KB, 5KB, 10KB
- Load variations: 10 → 2000+ records/second
- 5 testing phases with complete k6 scripts
- Success criteria and reporting structure

---

## 🎯 Key Takeaways for Tomorrow's Discussion

### Point 1: K6 on AWS
- **Most Common**: Teams run k6 from EC2 instances in the same region
- **Metrics Export**: CloudWatch (easiest), InfluxDB+Grafana (rich), K6 Cloud (managed)
- **Integration**: CI/CD pipelines, GitHub Actions, Jenkins

### Point 2: Critical Metrics
1. **IteratorAgeMilliseconds** - Are we falling behind?
2. **Lambda Duration** - Processing efficiency
3. **Lambda Errors** - Reliability
4. **Throttles** - Capacity issues  
5. **RecordProcessingLatency** - End-to-end performance

### Point 3: Testing Plan
- **Payload Sizes**: 100B, 500B (baseline), 1KB, 5KB, 10KB
- **Load Levels**: 10, 50, 100, 200, 500, 1000, 2000+ RPS
- **Timeline**: 4 weeks (Baseline → Sustained → Stress → Large Payloads → Endurance)
- **Deliverables**: Performance baseline, bottlenecks, optimizations, cost analysis

---

## 📁 Repository Structure

```
.
├── README.md                              # This file
├── PERFORMANCE_TESTING_README.md          # Complete quick start guide
├── k6-performance-testing-guide.md        # Point #1: K6 on AWS
├── kinesis-lambda-metrics.md              # Point #2: Metrics to collect
├── performance-testing-plan.md            # Point #3: Testing plan
├── k6-test-scripts/                       # Ready-to-use K6 scripts
│   ├── README.md                          # Script usage guide
│   ├── baseline-100b.js                   # 100-byte payload test
│   ├── baseline-500b.js                   # 500-byte payload test
│   └── spike-test.js                      # Spike/burst traffic test
└── cloudwatch-dashboards/                 # CloudWatch dashboard templates
    ├── README.md                          # Dashboard setup guide
    └── pipeline-overview.json             # Main performance dashboard
```

---

## ✅ What's Ready for You

### Documentation ✅
- [x] Complete guide on K6 usage and metrics collection
- [x] Comprehensive metrics list with implementation examples
- [x] Detailed testing plan with 5 phases over 4 weeks
- [x] Executive summary for manager discussion

### Test Scripts ✅
- [x] Baseline test - 100-byte payload
- [x] Baseline test - 500-byte payload  
- [x] Spike test for resilience testing
- [x] Complete usage instructions

### Monitoring ✅
- [x] CloudWatch dashboard template
- [x] Dashboard deployment guide
- [x] Key metrics visualization

---

## 🚦 Next Steps

### Today (Before Meeting)
1. Review [PERFORMANCE_TESTING_README.md](./PERFORMANCE_TESTING_README.md)
2. Read the executive summary sections
3. Note questions to ask your manager

### After Manager Approval
1. Set up test environment (Kinesis stream, Lambda function)
2. Deploy CloudWatch dashboard
3. Install and configure K6
4. Run first baseline test (100B payload)
5. Document findings and iterate

---

## 💡 Quick Reference

**Install K6**:
```bash
brew install k6  # macOS
```

**Run Your First Test**:
```bash
export AWS_REGION="us-east-1"
export KINESIS_STREAM_NAME="your-stream"
k6 run k6-test-scripts/baseline-100b.js
```

**Deploy CloudWatch Dashboard**:
```bash
aws cloudwatch put-dashboard \
  --dashboard-name "Kinesis-Lambda-Performance" \
  --dashboard-body file://cloudwatch-dashboards/pipeline-overview.json
```

---

## 📞 Questions for Your Manager

1. What is our expected production load? (records/second)
2. Current Kinesis configuration? (number of shards)
3. Lambda memory/timeout settings?
4. Do we have a test environment ready?
5. What's our testing budget?
6. Timeline expectations?
7. Who else should be involved?

---

**You're fully prepared with comprehensive documentation, actionable plans, and ready-to-use tools!** 🎉