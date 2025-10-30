# Kinesis + Lambda Pipeline Performance Metrics

## 2. Metrics to Collect for Kinesis + Lambda Pipeline

### Architecture Overview
A typical Kinesis + Lambda pipeline involves:
1. **Data Producers** → Send records to Kinesis Stream
2. **Kinesis Data Stream** → Buffers and distributes data
3. **Lambda Function** → Processes records from Kinesis
4. **Downstream Services** → DynamoDB, S3, another Kinesis Stream, etc.

### Key Metrics Categories

## 2.1 Kinesis Stream Metrics (CloudWatch)

### Incoming Data Metrics
| Metric | Description | Why Important | Target/Threshold |
|--------|-------------|---------------|------------------|
| `IncomingRecords` | Number of records successfully put | Measures throughput | Baseline varies |
| `IncomingBytes` | Number of bytes successfully put | Data volume tracking | < Stream capacity |
| `PutRecord.Success` | Successful PutRecord operations | Producer success rate | > 99% |
| `PutRecord.Latency` | Time for PutRecord operations | Producer performance | < 100ms (p99) |
| `WriteProvisionedThroughputExceeded` | Throttled write requests | Capacity planning | 0 (ideally) |

### Stream Health Metrics
| Metric | Description | Why Important | Target/Threshold |
|--------|-------------|---------------|------------------|
| `GetRecords.Success` | Successful GetRecords calls | Consumer health | > 99% |
| `GetRecords.Latency` | Time for GetRecords operations | Read performance | < 200ms (p99) |
| `GetRecords.Records` | Records retrieved per GetRecords call | Batch efficiency | Monitor trends |
| `ReadProvisionedThroughputExceeded` | Throttled read requests | Consumer scaling | 0 (ideally) |
| `IteratorAgeMilliseconds` | Age of the last record read | Processing lag | < 1000ms |

## 2.2 Lambda Function Metrics (CloudWatch)

### Execution Metrics
| Metric | Description | Why Important | Target/Threshold |
|--------|-------------|---------------|------------------|
| `Invocations` | Number of times function invoked | Processing volume | Match incoming rate |
| `Duration` | Execution time per invocation | Processing efficiency | < Timeout value |
| `ConcurrentExecutions` | Functions running simultaneously | Scaling behavior | < Account limit |
| `Errors` | Number of invocation errors | Error rate | < 1% |
| `Throttles` | Rejected invocations due to concurrency | Capacity issues | 0 (ideally) |
| `DeadLetterErrors` | Failed async event deliveries | DLQ issues | 0 (ideally) |
| `IteratorAge` | Age of last record processed (Kinesis) | Processing lag | < 1000ms |

### Resource Metrics
| Metric | Description | Why Important | Target/Threshold |
|--------|-------------|---------------|------------------|
| `MemoryUtilization` | Percentage of allocated memory used | Right-sizing | 60-80% |
| `MaxMemoryUsed` | Maximum memory used during execution | Memory allocation | < Allocated memory |
| `InitDuration` | Cold start time | Latency optimization | < 1000ms |

## 2.3 End-to-End Pipeline Metrics

### Custom Application Metrics
| Metric | Description | Why Important | How to Collect |
|--------|-------------|---------------|----------------|
| `RecordProcessingLatency` | Time from Kinesis ingestion to Lambda completion | End-to-end performance | Custom CloudWatch metric |
| `BatchSize` | Number of records per Lambda invocation | Batch optimization | Lambda event analysis |
| `RecordProcessingSuccess` | Successfully processed records | Data integrity | Custom counter |
| `RecordProcessingFailure` | Failed record processing | Error tracking | Custom counter |
| `DLQMessages` | Records sent to Dead Letter Queue | Failure analysis | DLQ monitoring |
| `DownstreamWriteLatency` | Time to write to downstream services | Bottleneck detection | Custom metric |
| `DownstreamWriteSuccess` | Successful downstream writes | Data delivery | Custom metric |

## 2.4 Cost Metrics

### Financial Tracking
| Metric | Description | Why Important |
|--------|-------------|---------------|
| `Kinesis Shard Hours` | Number of shard hours consumed | Kinesis costs |
| `Lambda GB-Seconds` | Memory × Duration | Lambda costs |
| `Lambda Invocations` | Total invocation count | Request costs |
| `Data Transfer` | Data transferred out of AWS | Network costs |

## 2.5 K6 Load Testing Metrics (for Pipeline Testing)

### Producer Performance (K6 → Kinesis)
| Metric | Description | Target |
|--------|-------------|--------|
| `kinesis_put_record_duration` | Time to put record to Kinesis | < 50ms (avg), < 100ms (p95) |
| `kinesis_put_record_success_rate` | Successful PUT operations | > 99.9% |
| `kinesis_put_record_throughput` | Records/second sent to Kinesis | Meet load requirements |
| `kinesis_throttling_rate` | Rate of throttled requests | < 0.1% |

### System Performance Under Load
| Metric | Description | Target |
|--------|-------------|--------|
| `end_to_end_latency` | Time from k6 send to Lambda completion | < 2000ms (p95) |
| `pipeline_throughput` | Records processed per second | Match input rate |
| `error_rate` | Percentage of failed records | < 0.1% |
| `lambda_cold_start_rate` | Percentage of invocations with cold start | < 5% |

## 2.6 Monitoring Implementation

### CloudWatch Custom Metrics Example
```python
import boto3
import time
from datetime import datetime

cloudwatch = boto3.client('cloudwatch')

def publish_custom_metric(metric_name, value, unit='Count'):
    cloudwatch.put_metric_data(
        Namespace='KinesisLambdaPipeline',
        MetricData=[
            {
                'MetricName': metric_name,
                'Value': value,
                'Unit': unit,
                'Timestamp': datetime.utcnow(),
                'Dimensions': [
                    {'Name': 'Environment', 'Value': 'Production'},
                    {'Name': 'Pipeline', 'Value': 'KinesisLambda'}
                ]
            }
        ]
    )

# In Lambda function
def lambda_handler(event, context):
    start_time = time.time()
    successful_records = 0
    failed_records = 0
    
    for record in event['Records']:
        try:
            # Process record
            kinesis_arrival_time = record['kinesis']['approximateArrivalTimestamp']
            processing_latency = (time.time() - kinesis_arrival_time) * 1000
            
            # Publish latency metric
            publish_custom_metric('RecordProcessingLatency', processing_latency, 'Milliseconds')
            
            successful_records += 1
        except Exception as e:
            failed_records += 1
            print(f"Error processing record: {e}")
    
    # Publish success/failure metrics
    publish_custom_metric('RecordsProcessedSuccess', successful_records)
    publish_custom_metric('RecordsProcessedFailure', failed_records)
    
    return {'statusCode': 200}
```

### CloudWatch Dashboard JSON
```json
{
    "widgets": [
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/Kinesis", "IncomingRecords", {"stat": "Sum"}],
                    ["AWS/Lambda", "Invocations", {"stat": "Sum"}]
                ],
                "period": 60,
                "stat": "Sum",
                "region": "us-east-1",
                "title": "Pipeline Throughput"
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/Lambda", "Duration", {"stat": "Average"}],
                    ["KinesisLambdaPipeline", "RecordProcessingLatency", {"stat": "Average"}]
                ],
                "period": 60,
                "stat": "Average",
                "region": "us-east-1",
                "title": "Latency Metrics"
            }
        }
    ]
}
```

## Priority Metrics (Start Here)

If you're just getting started, focus on these critical metrics first:

1. **IteratorAgeMilliseconds** (Kinesis) - Indicates if you're falling behind
2. **Lambda Duration** - Shows processing efficiency
3. **Lambda Errors** - Critical for reliability
4. **Throttles** (Both Kinesis & Lambda) - Capacity issues
5. **IncomingRecords** vs **Invocations** - Ensures all data is processed
6. **RecordProcessingLatency** (Custom) - End-to-end performance

## Alerting Thresholds

Set up CloudWatch Alarms for:
- IteratorAge > 60000ms (1 minute behind)
- Lambda Error Rate > 1%
- Lambda Throttles > 0
- Kinesis WriteProvisionedThroughputExceeded > 0
- Lambda Duration > 80% of timeout
- ConcurrentExecutions > 80% of limit
