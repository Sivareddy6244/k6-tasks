# K6 Performance Testing Resources for Kinesis + Lambda Pipeline

## 📋 Quick Start Guide

This repository contains comprehensive documentation and resources for performance testing a Kinesis + Lambda pipeline using K6.

## 📚 Documentation Overview

### 1. **[K6 Performance Testing Guide](./k6-performance-testing-guide.md)**
**Addresses Manager's Point #1**: "Check how teams use k6 against their application on AWS and how they collect performance metrics"

**Key Topics:**
- How teams deploy k6 on AWS (EC2, ECS, Lambda, K6 Cloud)
- Methods for collecting performance metrics
- Integration with CloudWatch, InfluxDB, Grafana, Prometheus, DataDog
- Real-time monitoring setup
- Best practices for AWS deployments

**Quick Answer:** Teams typically:
- Run k6 from EC2 instances or containers in the same AWS region
- Export metrics to CloudWatch for AWS-native integration
- Use InfluxDB + Grafana for rich visualization
- Send metrics to K6 Cloud for managed solution
- Create custom metrics for business-specific measurements

---

### 2. **[Kinesis + Lambda Metrics Guide](./kinesis-lambda-metrics.md)**
**Addresses Manager's Point #2**: "What metrics we need to collect for our kinesis+lambda pipeline and what would be relevant"

**Key Topics:**
- Comprehensive list of Kinesis Stream metrics
- Lambda function metrics to monitor
- End-to-end pipeline metrics
- Cost metrics
- K6 load testing metrics
- Implementation examples with code
- CloudWatch dashboard setup
- Priority metrics to start with
- Alerting thresholds

**Priority Metrics to Start:**
1. **IteratorAgeMilliseconds** - Are we falling behind?
2. **Lambda Duration** - How fast are we processing?
3. **Lambda Errors** - Are we processing correctly?
4. **Throttles** - Are we hitting capacity limits?
5. **RecordProcessingLatency** - End-to-end performance

---

### 3. **[Performance Testing Plan](./performance-testing-plan.md)**
**Addresses Manager's Point #3**: "Come up with a plan - different set of payloads like 100, 200, 300 etc. and metrics to collect"

**Key Topics:**
- Complete testing strategy with 5 phases
- Payload size variations (100B, 500B, 1KB, 5KB, 10KB)
- Load variations (10 → 2000+ records/second)
- Complete k6 test scripts
- Metrics collection matrix
- Success criteria for each test
- Execution checklist
- Reporting structure
- Cost estimation

**Test Phases:**
1. **Phase 1**: Baseline Performance (Small, Medium, Large payloads)
2. **Phase 2**: Sustained Load Testing
3. **Phase 3**: Stress & Spike Testing
4. **Phase 4**: Large Payload Testing
5. **Phase 5**: 24-Hour Endurance Testing

---

## 🎯 Executive Summary for Manager Discussion

### Point 1: How Teams Use K6 on AWS
**Answer:** Teams run k6 tests from:
- **EC2 instances** in the same AWS region (most common)
- **ECS/EKS containers** for scalable load generation
- **K6 Cloud** for managed testing with global distribution

**Metrics Collection:** Teams export to:
1. **CloudWatch** (AWS-native, easiest integration)
2. **InfluxDB + Grafana** (rich visualization)
3. **K6 Cloud** (managed, no setup required)

### Point 2: Metrics for Kinesis + Lambda Pipeline
**Critical Metrics** (Priority Order):
1. **IteratorAgeMilliseconds** → Shows if processing is falling behind
2. **Lambda Duration** → Processing efficiency
3. **Lambda Errors** → Reliability
4. **Throttles** → Capacity issues
5. **IncomingRecords vs Invocations** → Data flow validation
6. **RecordProcessingLatency** (Custom) → End-to-end performance

**Full List:** See [kinesis-lambda-metrics.md](./kinesis-lambda-metrics.md) for 30+ metrics organized by category

### Point 3: Testing Plan with Different Payloads
**Payload Sizes to Test:**
- 100 bytes (small events)
- 500 bytes (standard events) ← **Baseline**
- 1 KB (detailed records)
- 5 KB (complex data)
- 10 KB (near maximum)

**Load Levels per Payload:**
- 10 records/second → 50 → 100 → 200 → 500 → 1000 → 2000+

**Testing Timeline:** 4 weeks
- **Week 1**: Baseline tests with all payload sizes
- **Week 2**: Sustained load and variable patterns
- **Week 3**: Stress testing and spike testing
- **Week 4**: Endurance testing (24 hours)

**Deliverables:**
- Performance baseline report
- Identified bottlenecks
- Optimization recommendations
- Cost per million records
- Configuration recommendations

---

## 🚀 Getting Started - Today's Action Items

### Step 1: Environment Setup (2 hours)
```bash
# Install k6
brew install k6  # macOS
# or
sudo apt-get install k6  # Linux
# or
choco install k6  # Windows

# Install AWS CLI
pip install awscli

# Configure AWS credentials
aws configure
```

### Step 2: Set Up Monitoring (1 hour)
1. Create CloudWatch Dashboard (use template from kinesis-lambda-metrics.md)
2. Set up CloudWatch Alarms for:
   - IteratorAge > 60000ms
   - Lambda Errors > 1%
   - Lambda Throttles > 0
3. Enable detailed monitoring on Lambda

### Step 3: Run First Test (30 minutes)
```bash
# Export environment variables
export AWS_REGION="us-east-1"
export KINESIS_STREAM_NAME="your-stream-name"

# Run baseline test with 100-byte payload
k6 run --out json=results.json small-payload-test.js

# Analyze results
cat results.json | jq '.metrics'
```

### Step 4: Review Results (1 hour)
1. Check CloudWatch dashboard
2. Verify metrics are being collected
3. Document baseline numbers
4. Identify any immediate issues

---

## 📊 Expected Outcomes

### After Week 1
- ✅ Baseline performance established for all payload sizes
- ✅ Initial bottlenecks identified
- ✅ Monitoring dashboards operational
- ✅ Clear understanding of current capacity

### After Month 1
- ✅ Complete performance profile documented
- ✅ Breaking points identified
- ✅ Optimization recommendations ready
- ✅ Cost projections for different load levels
- ✅ Production-ready configuration

---

## 💰 Cost Considerations

### Testing Costs (Estimated)
- **K6 EC2 Instance** (t3.large): ~$0.08/hour × 40 hours = $3.20
- **Kinesis** (2 shards): ~$0.015/hour × 160 hours = $2.40
- **Lambda** (1M requests): ~$0.20
- **CloudWatch** (metrics & logs): ~$5
- **Total Estimated**: ~$15-20 for complete testing cycle

### Production Costs (per million records)
See cost estimation table in [performance-testing-plan.md](./performance-testing-plan.md)

---

## 🤝 Team Collaboration

### Questions to Ask Other Teams
1. **What k6 output format do you use?** (JSON, InfluxDB, CloudWatch, K6 Cloud?)
2. **How do you run k6 tests?** (Local, EC2, CI/CD?)
3. **What are your key metrics?** (Response time, throughput, error rate?)
4. **How do you visualize results?** (Grafana, CloudWatch, K6 Cloud?)
5. **What thresholds do you use?** (P95, P99, error rate?)
6. **How do you handle test data?** (Generated, recorded, mixed?)

### Information to Share with Manager
- ✅ Complete documentation created (3 guides)
- ✅ Testing plan ready with specific payload sizes and load levels
- ✅ Metrics collection strategy defined
- ✅ 4-week execution timeline
- ✅ Ready to start testing immediately

---

## 📁 Repository Structure

```
├── README.md                           # This file - overview
├── k6-performance-testing-guide.md     # Point #1: How teams use k6
├── kinesis-lambda-metrics.md           # Point #2: What metrics to collect
├── performance-testing-plan.md         # Point #3: Testing plan with payloads
├── k6-test-scripts/                    # (To be created) K6 test scripts
│   ├── baseline-100b.js
│   ├── baseline-500b.js
│   ├── baseline-1kb.js
│   ├── sustained-load.js
│   ├── spike-test.js
│   └── stress-test.js
├── cloudwatch-dashboards/              # (To be created) Dashboard templates
│   ├── pipeline-overview.json
│   └── detailed-metrics.json
└── results/                            # (To be created) Test results
    └── .gitkeep
```

---

## 📝 Next Steps for Tomorrow's Discussion

### Prepare to Discuss:
1. ✅ **Point #1 Response**: How teams use k6 (see k6-performance-testing-guide.md)
   - Teams run from EC2/ECS in same region
   - Export to CloudWatch, InfluxDB, or K6 Cloud
   - Can share specific examples and patterns

2. ✅ **Point #2 Response**: Metrics to collect (see kinesis-lambda-metrics.md)
   - 6 priority metrics identified
   - 30+ total metrics categorized
   - Implementation examples provided
   - CloudWatch dashboard ready to deploy

3. ✅ **Point #3 Response**: Testing plan (see performance-testing-plan.md)
   - 5 payload sizes: 100B, 500B, 1KB, 5KB, 10KB
   - 7 load levels: 10 → 2000+ records/second
   - 5-phase testing approach over 4 weeks
   - Complete k6 scripts included
   - Clear success criteria defined

### Questions to Ask Manager:
1. What is our expected production load? (records/second)
2. What is our current Kinesis configuration? (number of shards)
3. What is our Lambda memory/timeout configuration?
4. Do we have a test environment ready, or do we need to create one?
5. What is our budget for testing? (affects duration/scale)
6. When do we need to complete performance testing?
7. Who else should be involved? (DevOps, SRE, other teams?)

---

## 🔧 Tools & Technologies

- **K6** - Load testing tool
- **AWS Kinesis** - Data streaming service
- **AWS Lambda** - Serverless compute
- **AWS CloudWatch** - Metrics and logging
- **InfluxDB** (Optional) - Time-series database
- **Grafana** (Optional) - Visualization
- **AWS CLI** - AWS management
- **jq** - JSON processing

---

## 📞 Support & Resources

- **K6 Documentation**: https://k6.io/docs/
- **AWS Kinesis Best Practices**: https://docs.aws.amazon.com/kinesis/
- **AWS Lambda Best Practices**: https://docs.aws.amazon.com/lambda/
- **K6 AWS Extension**: https://github.com/grafana/xk6-output-cloudwatch

---

## ✅ Checklist for Tomorrow's Meeting

- [ ] Review all three documentation files
- [ ] Understand the testing phases and timeline
- [ ] Know the priority metrics by heart
- [ ] Be ready to explain k6 deployment options
- [ ] Have questions ready for the manager
- [ ] Be prepared to discuss timeline and resources needed
- [ ] Understand cost implications
- [ ] Know what information you need from other teams

**You're now fully prepared with comprehensive documentation, actionable plans, and clear next steps!** 🎉
