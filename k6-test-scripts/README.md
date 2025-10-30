# K6 Test Scripts for Kinesis + Lambda Pipeline

This directory contains production-ready K6 test scripts for performance testing your Kinesis + Lambda pipeline.

## Available Test Scripts

### 1. `baseline-100b.js` - Small Payload Baseline Test
- **Payload Size**: ~100 bytes
- **Load Pattern**: 10 → 50 → 100 → 200 RPS
- **Duration**: ~25 minutes
- **Purpose**: Establish baseline performance with minimal payloads

### 2. `baseline-500b.js` - Medium Payload Baseline Test
- **Payload Size**: ~500 bytes
- **Load Pattern**: 10 → 50 → 100 → 200 RPS
- **Duration**: ~25 minutes
- **Purpose**: Test with standard event size (recommended baseline)

### 3. `spike-test.js` - Spike/Burst Traffic Test
- **Payload Size**: ~500 bytes
- **Load Pattern**: 50 → 500 → 50 RPS
- **Duration**: ~14 minutes
- **Purpose**: Test system resilience during sudden traffic spikes

## Prerequisites

### 1. Install K6
```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6
```

### 2. Configure AWS Credentials
```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Enter your default region (e.g., us-east-1)
```

### 3. Set Environment Variables
```bash
export AWS_REGION="us-east-1"
export KINESIS_STREAM_NAME="your-stream-name"
```

## Important: Actual AWS Integration

**Note**: The scripts in this directory contain placeholder code for Kinesis integration. To use them with actual AWS Kinesis, you have several options:

### Option 1: Use K6 Extensions (Recommended)
Install the K6 Kinesis extension:
```bash
# Build k6 with Kinesis extension
xk6 build --with github.com/grafana/xk6-output-cloudwatch
```

### Option 2: Create Lambda Proxy Endpoint
Create an API Gateway + Lambda endpoint that proxies requests to Kinesis:

```javascript
// Lambda function (kinesis-proxy)
const AWS = require('aws-sdk');
const kinesis = new AWS.Kinesis();

exports.handler = async (event) => {
    const body = JSON.parse(event.body);
    
    const params = {
        StreamName: body.StreamName,
        Data: Buffer.from(body.Data, 'base64'),
        PartitionKey: body.PartitionKey,
    };
    
    try {
        const result = await kinesis.putRecord(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify(result),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
```

Then update the scripts to use your API Gateway endpoint:
```bash
export KINESIS_ENDPOINT="https://your-api-gateway-url/prod/kinesis/putRecord"
```

### Option 3: Use AWS SDK with Signed Requests
Modify the scripts to use proper AWS Signature V4 signing. Example:

```javascript
import http from 'k6/http';
import { sha256, hmac } from 'k6/crypto';

function putRecordToKinesis(streamName, data, partitionKey) {
    const region = __ENV.AWS_REGION;
    const accessKey = __ENV.AWS_ACCESS_KEY_ID;
    const secretKey = __ENV.AWS_SECRET_ACCESS_KEY;
    
    const service = 'kinesis';
    const host = `kinesis.${region}.amazonaws.com`;
    const url = `https://${host}/`;
    
    const payload = JSON.stringify({
        StreamName: streamName,
        Data: Buffer.from(data).toString('base64'),
        PartitionKey: partitionKey,
    });
    
    // AWS Signature V4 signing logic here
    // (Full implementation available in AWS SDK documentation)
    
    const params = {
        headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'Kinesis_20131202.PutRecord',
            'Authorization': signedHeaders,
        },
    };
    
    return http.post(url, payload, params);
}
```

## Running Tests

### Basic Usage

```bash
# Run baseline 100-byte test
k6 run baseline-100b.js

# Run baseline 500-byte test  
k6 run baseline-500b.js

# Run spike test
k6 run spike-test.js
```

### With Output to File

```bash
# Save results to JSON
k6 run --out json=results-100b.json baseline-100b.js

# Save results to InfluxDB (if available)
k6 run --out influxdb=http://localhost:8086/k6db baseline-500b.js

# Save results to CloudWatch (if extension installed)
k6 run --out cloudwatch baseline-500b.js
```

### With Custom Environment Variables

```bash
k6 run \
  -e AWS_REGION=us-west-2 \
  -e KINESIS_STREAM_NAME=my-stream \
  -e KINESIS_ENDPOINT=https://my-api.execute-api.us-west-2.amazonaws.com/prod/kinesis \
  baseline-500b.js
```

### With Custom VU Count (Quick Test)

```bash
# Quick test with fewer VUs
k6 run --vus 10 --duration 30s baseline-100b.js
```

## Test Results

Results will be saved in the following formats:

### Console Output
Real-time metrics displayed during test execution:
- Request rate (requests/second)
- Success rate
- Latency percentiles (p95, p99)
- Active VUs

### JSON Summary
Saved to `summary.json` or custom filename:
```json
{
  "testRunId": "test-1234567890",
  "metrics": {
    "kinesis_success_rate": 0.99,
    "kinesis_put_duration_avg": 45.2,
    "kinesis_put_duration_p95": 89.5,
    "kinesis_put_duration_p99": 125.3,
    "records_sent": 12500,
    "records_failed": 125
  }
}
```

## Monitoring During Tests

### CloudWatch Dashboards
Monitor these metrics in real-time:
1. **Kinesis**: IncomingRecords, IncomingBytes, IteratorAge
2. **Lambda**: Invocations, Duration, Errors, Throttles
3. **Custom**: RecordProcessingLatency

### CloudWatch Logs
```bash
# Tail Lambda logs during test
aws logs tail /aws/lambda/your-function-name --follow

# Filter for errors
aws logs tail /aws/lambda/your-function-name --follow --filter-pattern "ERROR"
```

### K6 Real-time Output
```bash
# Run with real-time summary
k6 run --summary-trend-stats="avg,min,med,max,p(90),p(95),p(99)" baseline-500b.js
```

## Interpreting Results

### Success Criteria

#### Baseline Tests (100b, 500b)
- ✅ **Success Rate**: >99%
- ✅ **P95 Latency**: <100ms (100b), <150ms (500b)
- ✅ **P99 Latency**: <200ms (100b), <250ms (500b)
- ✅ **Throttles**: 0

#### Spike Test
- ✅ **Success Rate**: >95% (during spike)
- ✅ **P95 Latency**: <300ms
- ✅ **Recovery Time**: <5 minutes to normal latency
- ✅ **Data Loss**: 0 records

### Red Flags
- 🚨 **Success Rate < 95%**: Capacity issues, check throttles
- 🚨 **P99 Latency > 500ms**: Processing bottleneck
- 🚨 **Increasing Latency**: System falling behind
- 🚨 **Lambda Errors**: Code issues or timeouts
- 🚨 **IteratorAge Growing**: Not keeping up with input rate

## Troubleshooting

### Issue: High Throttling Rate
**Solution**:
- Increase Kinesis shard count
- Reduce test load
- Check AWS service limits

### Issue: High Latency
**Solution**:
- Increase Lambda memory allocation
- Optimize Lambda code
- Check downstream service latency
- Consider provisioned concurrency

### Issue: Test Script Errors
**Solution**:
- Verify AWS credentials are configured
- Check environment variables
- Ensure Kinesis stream exists
- Verify network connectivity to AWS

### Issue: Inconsistent Results
**Solution**:
- Run test multiple times
- Check for concurrent tests/traffic
- Verify time of day (avoid peak AWS hours)
- Check for cold starts

## Best Practices

### 1. Start Small
Begin with baseline-100b.js at low load before scaling up.

### 2. Monitor Continuously
Keep CloudWatch dashboards open during tests.

### 3. Test in Isolation
Run tests when no other traffic is present for clean results.

### 4. Document Everything
Save test results, configurations, and observations.

### 5. Test Regularly
Run tests weekly to catch regressions early.

### 6. Use Realistic Data
Update payloads to match actual production patterns.

### 7. Cost Awareness
Monitor costs during tests, especially for long-running tests.

## Next Steps

1. **Customize Payloads**: Update payload structures to match your actual data
2. **Add More Tests**: Create tests for 1KB, 5KB, 10KB payloads
3. **Integrate CI/CD**: Add tests to your deployment pipeline
4. **Set Up Alerts**: Create CloudWatch alarms based on test results
5. **Automate Reporting**: Create scripts to parse and visualize results

## Support

For issues or questions:
1. Check K6 documentation: https://k6.io/docs/
2. Review AWS Kinesis limits: https://docs.aws.amazon.com/kinesis/
3. Check this repository's main documentation

## Example: Complete Test Run

```bash
#!/bin/bash
# complete-test-run.sh

echo "Starting Performance Test Suite"
echo "================================"

# Set environment
export AWS_REGION="us-east-1"
export KINESIS_STREAM_NAME="my-test-stream"

# Create results directory
mkdir -p results/$(date +%Y%m%d)

# Run baseline tests
echo "Running 100B baseline test..."
k6 run --out json=results/$(date +%Y%m%d)/baseline-100b.json baseline-100b.js

echo "Waiting 5 minutes for system to stabilize..."
sleep 300

echo "Running 500B baseline test..."
k6 run --out json=results/$(date +%Y%m%d)/baseline-500b.json baseline-500b.js

echo "Waiting 5 minutes for system to stabilize..."
sleep 300

echo "Running spike test..."
k6 run --out json=results/$(date +%Y%m%d)/spike-test.json spike-test.js

echo "Test suite complete!"
echo "Results saved to: results/$(date +%Y%m%d)/"
```

Run with:
```bash
chmod +x complete-test-run.sh
./complete-test-run.sh
```
