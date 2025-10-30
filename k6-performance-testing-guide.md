# K6 Performance Testing Guide for AWS Applications

## 1. How Teams Use K6 Against AWS Applications and Collect Performance Metrics

### Overview
K6 is a modern load testing tool designed for testing the performance of APIs, microservices, and websites. Teams using k6 on AWS typically follow these patterns:

### Common Approaches

#### 1.1 K6 Cloud Integration
- **K6 Cloud Service**: Teams can run k6 tests from K6 Cloud and target their AWS applications
- **Benefits**: 
  - Distributed load testing from multiple global locations
  - Real-time metrics visualization
  - Historical performance tracking
  - Easy CI/CD integration

#### 1.2 Self-Hosted K6 on AWS
- **EC2 Instances**: Run k6 tests from EC2 instances in the same region as the application
- **ECS/EKS**: Deploy k6 as containerized tasks for scalable load generation
- **Lambda**: Run k6 in Lambda for periodic performance checks (limited by execution time)

#### 1.3 CI/CD Integration
- **GitHub Actions**: Trigger k6 tests on code commits or PRs
- **AWS CodePipeline**: Integrate k6 tests in deployment pipelines
- **Jenkins**: Run k6 tests as part of build process

### Metric Collection Methods

#### 1. Built-in K6 Metrics
K6 automatically collects these metrics:
- **http_req_duration**: Total request time
- **http_req_waiting**: Time to first byte (TTFB)
- **http_req_sending**: Time sending data
- **http_req_receiving**: Time receiving data
- **http_req_blocked**: Time blocked before initiating request
- **http_req_connecting**: Time establishing TCP connection
- **http_reqs**: Total HTTP requests
- **vus**: Number of active virtual users
- **iterations**: Number of iterations completed

#### 2. Output to AWS Services
Teams typically send metrics to:

**CloudWatch**:
```javascript
// Export metrics to CloudWatch
import { AWSConfig, CloudWatch } from 'k6/x/cloudwatch';

export function setup() {
    const cloudwatch = new CloudWatch({
        region: 'us-east-1',
    });
    return { cloudwatch };
}
```

**InfluxDB + Grafana**:
```bash
k6 run --out influxdb=http://localhost:8086/k6db script.js
```

**Prometheus**:
```bash
k6 run --out experimental-prometheus-rw script.js
```

**DataDog**:
```bash
k6 run --out datadog script.js
```

**S3 for Long-term Storage**:
```bash
k6 run --out json=results.json script.js
aws s3 cp results.json s3://my-bucket/k6-results/
```

#### 3. Custom Metrics
Teams create custom metrics for business-specific measurements:

```javascript
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';

const myCounter = new Counter('my_custom_counter');
const myTrend = new Trend('my_custom_trend');
const myRate = new Rate('my_custom_rate');
const myGauge = new Gauge('my_custom_gauge');

export default function () {
    myCounter.add(1);
    myTrend.add(response.timings.duration);
    myRate.add(response.status === 200);
    myGauge.add(response.body.length);
}
```

### Real-time Monitoring Setup

#### Option 1: CloudWatch Dashboard
```javascript
// Send metrics to CloudWatch in real-time
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

export function handleSummary(data) {
    const client = new CloudWatchClient({ region: 'us-east-1' });
    
    const params = {
        Namespace: 'K6/LoadTesting',
        MetricData: [
            {
                MetricName: 'RequestDuration',
                Value: data.metrics.http_req_duration.avg,
                Unit: 'Milliseconds',
            },
        ],
    };
    
    client.send(new PutMetricDataCommand(params));
}
```

#### Option 2: InfluxDB + Grafana
1. Deploy InfluxDB on EC2 or use Amazon Timestream
2. Deploy Grafana on EC2 or use Amazon Managed Grafana
3. Configure k6 to output to InfluxDB
4. Create Grafana dashboards for real-time visualization

#### Option 3: K6 Cloud (Simplest)
```bash
k6 cloud script.js  # Automatically sends metrics to K6 Cloud
```

### Best Practices for AWS Deployments

1. **Run k6 in the same AWS region** as your application to minimize network latency
2. **Use VPC peering** if testing internal services
3. **Monitor k6 resource usage** - ensure k6 instances don't become the bottleneck
4. **Use AWS X-Ray** for distributed tracing alongside k6 metrics
5. **Store results in S3** for compliance and historical analysis
6. **Set up CloudWatch alarms** on key k6 metrics
7. **Use tags** in CloudWatch to organize metrics by test scenario

