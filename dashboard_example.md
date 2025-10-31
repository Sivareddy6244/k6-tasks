## AWS → GCP Payload Flow

## Panels

1. **AWS Lambda Metrics**
   - Invocation count
   - Error count
   - Duration

2. **Kinesis Stream Metrics**
   - Incoming records
   - Get/Put errors
   - Throughput

3. **Transit VPC / VPN**
   - VPN Tunnel status
   - Network throughput

4. **GCP BigQuery**
   - Row ingestion rate
   - Query latency

5. **End-to-End Trace Panel**
   - Custom logs showing unique TraceIDs at each stage (ECS, Kinesis, Lambda, GCP)

## Data Sources

- **AWS CloudWatch**
- **GCP Cloud Monitoring**
- **Elasticsearch/Loki** (for centralized log search, if applicable)

## Example Grafana Query (CloudWatch Lambda Errors)
```
namespace="AWS/Lambda"
metric_name="Errors"
stat="Sum"
dimensions={FunctionName="my-lambda-function"}
```