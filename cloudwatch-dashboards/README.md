# CloudWatch Dashboard Templates

This directory contains CloudWatch dashboard templates for monitoring your Kinesis + Lambda pipeline during performance testing.

## Available Dashboards

### 1. `pipeline-overview.json` - Main Performance Dashboard

This dashboard provides a comprehensive view of your pipeline's health and performance.

**Widgets Include:**
- **Pipeline Throughput**: Kinesis incoming records vs Lambda invocations
- **Lambda Execution Duration**: Average, P95, and P99 latencies
- **Kinesis Iterator Age**: Processing lag indicator
- **Errors and Throttles**: All error types in one view
- **Lambda Concurrency**: Current concurrent executions
- **Kinesis Data Volume**: Incoming bytes
- **Success Metrics**: Single-value widgets for quick status
- **Recent Errors**: Log insights for error debugging

## How to Use

### Option 1: AWS Console (Manual Import)

1. Open AWS CloudWatch Console
2. Navigate to **Dashboards** in the left menu
3. Click **Create dashboard**
4. Enter a name (e.g., "Kinesis-Lambda-Performance")
5. Click **Actions** → **View/edit source**
6. Copy the contents of `pipeline-overview.json`
7. Paste into the source editor
8. Click **Update**
9. **Important**: Update the following placeholders:
   - Replace `YOUR_LAMBDA_FUNCTION_NAME` with your actual Lambda function name
   - Update the `region` field if not using `us-east-1`

### Option 2: AWS CLI (Automated)

```bash
# Set your configuration
DASHBOARD_NAME="Kinesis-Lambda-Performance"
REGION="us-east-1"
LAMBDA_FUNCTION_NAME="your-lambda-function-name"
KINESIS_STREAM_NAME="your-stream-name"

# Update the JSON file with your function name
sed -i "s/YOUR_LAMBDA_FUNCTION_NAME/$LAMBDA_FUNCTION_NAME/g" pipeline-overview.json

# Create the dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "$DASHBOARD_NAME" \
  --dashboard-body file://pipeline-overview.json \
  --region "$REGION"

echo "Dashboard created: https://console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=$DASHBOARD_NAME"
```

### Option 3: Terraform

```hcl
resource "aws_cloudwatch_dashboard" "kinesis_lambda_performance" {
  dashboard_name = "Kinesis-Lambda-Performance"

  dashboard_body = templatefile("${path.module}/cloudwatch-dashboards/pipeline-overview.json", {
    lambda_function_name = aws_lambda_function.processor.function_name
    kinesis_stream_name  = aws_kinesis_stream.main.name
    region              = var.aws_region
  })
}
```

## Customization

### Adding Custom Metrics

To add your custom application metrics:

```json
{
  "type": "metric",
  "x": 0,
  "y": 30,
  "width": 12,
  "height": 6,
  "properties": {
    "metrics": [
      ["KinesisLambdaPipeline", "RecordProcessingLatency", {"stat": "Average"}],
      ["...", {"stat": "p95"}],
      ["...", {"stat": "p99"}]
    ],
    "view": "timeSeries",
    "stacked": false,
    "region": "us-east-1",
    "title": "Custom Processing Latency",
    "period": 60
  }
}
```

### Filtering by Test Run

Add dimension filters to track specific test runs:

```json
{
  "metrics": [
    ["KinesisLambdaPipeline", "RecordProcessingLatency", {
      "stat": "Average",
      "dimensions": {
        "TestRun": "baseline-500b"
      }
    }]
  ]
}
```

### Adding Alarms to Dashboard

```json
{
  "type": "metric",
  "properties": {
    "metrics": [
      ["AWS/Lambda", "Errors"]
    ],
    "annotations": {
      "horizontal": [
        {
          "label": "High Error Rate",
          "value": 100,
          "fill": "above",
          "color": "#d13212"
        }
      ]
    }
  }
}
```

## Dashboard Layout

The dashboard is organized in a grid with coordinates (x, y, width, height):
- Grid is 24 units wide
- Each unit represents a portion of the screen
- Widgets are positioned to minimize scrolling

```
┌─────────────────────────┬─────────────────────────┐
│  Pipeline Throughput    │  Lambda Duration        │
│  (12 units)             │  (12 units)             │
├─────────────────────────┼─────────────────────────┤
│  Iterator Age           │  Errors & Throttles     │
│  (12 units)             │  (12 units)             │
├─────────────────────────┼─────────────────────────┤
│  Lambda Concurrency     │  Data Volume            │
│  (12 units)             │  (12 units)             │
├────────┬────────┬────────┴────────┬────────────────┤
│Success │Invokes │ Success Rate %  │                │
│ (8 u)  │ (8 u)  │  (8 u)          │                │
├────────┴────────┴─────────────────┴────────────────┤
│  Recent Lambda Errors (Logs Insights)              │
│  (24 units)                                        │
└────────────────────────────────────────────────────┘
```

## Key Metrics to Watch During Tests

### 1. Pipeline Throughput
- **What it shows**: Incoming records vs processed records
- **What to look for**: Both lines should match closely
- **Red flag**: Gap between lines indicates processing lag

### 2. Lambda Duration
- **What it shows**: How long Lambda takes to process
- **What to look for**: Stable latency, P99 < timeout value
- **Red flag**: Increasing duration over time

### 3. Iterator Age
- **What it shows**: How far behind Lambda is from real-time
- **What to look for**: < 1000ms consistently
- **Red flag**: Growing value indicates falling behind

### 4. Errors and Throttles
- **What it shows**: All failure modes
- **What to look for**: Zero or near-zero
- **Red flag**: Any non-zero value needs investigation

### 5. Concurrency
- **What it shows**: Parallel Lambda executions
- **What to look for**: Scales with load
- **Red flag**: Flat line during load increase

## Best Practices

### 1. Pre-Test Baseline
Before running tests, take a screenshot of the dashboard to establish baseline.

### 2. Real-Time Monitoring
Keep the dashboard open during all performance tests.

### 3. Auto-Refresh
Set dashboard to auto-refresh every 10 seconds during active testing:
- Click the refresh icon
- Select "Auto refresh" → "10 seconds"

### 4. Time Range
Adjust the time range to match your test duration:
- Use "Custom" → "Relative"
- Set to "Last 1 hour" for most tests
- Use "Last 3 hours" for sustained load tests

### 5. Export Screenshots
Take screenshots at key moments:
- Before test (baseline)
- During peak load
- After test (recovery)
- When anomalies occur

### 6. Use Annotations
Add manual annotations to mark test phases:
- Test start/end
- Configuration changes
- Observed anomalies

## Troubleshooting Dashboard Issues

### Issue: No Data Showing
**Causes:**
- Lambda function name incorrect
- Region mismatch
- No metrics published yet

**Solutions:**
- Verify function name in dashboard JSON
- Check region in all widget properties
- Wait for metrics (5-minute delay is normal)
- Verify Lambda has been invoked

### Issue: Some Widgets Empty
**Causes:**
- Metric namespace doesn't exist
- Custom metrics not published
- Insufficient permissions

**Solutions:**
- Check if custom metrics are being published
- Verify CloudWatch PutMetricData permissions
- Check metric namespace spelling

### Issue: Dashboard Not Updating
**Causes:**
- Auto-refresh disabled
- Browser cache

**Solutions:**
- Enable auto-refresh
- Hard refresh browser (Ctrl+F5)
- Check AWS service health

## Additional Resources

### Creating CloudWatch Alarms

```bash
# Example: Alert on high Iterator Age
aws cloudwatch put-metric-alarm \
  --alarm-name "kinesis-high-iterator-age" \
  --alarm-description "Alert when processing lag exceeds 1 minute" \
  --metric-name GetRecords.IteratorAgeMilliseconds \
  --namespace AWS/Kinesis \
  --statistic Maximum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 60000 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=StreamName,Value=your-stream-name
```

### Exporting Dashboard Data

```bash
# Download current dashboard
aws cloudwatch get-dashboard \
  --dashboard-name "Kinesis-Lambda-Performance" \
  --region us-east-1 \
  > current-dashboard-backup.json

# Get metric statistics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=your-function \
  --statistics Average,Maximum \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 60
```

## Next Steps

1. **Deploy the dashboard** using one of the methods above
2. **Customize widget positions** to match your preferences
3. **Add custom metrics** specific to your application
4. **Set up alarms** for critical thresholds
5. **Create runbooks** for common alert scenarios
6. **Train team members** on dashboard interpretation

## Dashboard URLs

After deployment, access your dashboard at:
```
https://console.aws.amazon.com/cloudwatch/home?region=REGION#dashboards:name=DASHBOARD_NAME
```

Replace:
- `REGION` with your AWS region (e.g., `us-east-1`)
- `DASHBOARD_NAME` with your dashboard name (e.g., `Kinesis-Lambda-Performance`)
