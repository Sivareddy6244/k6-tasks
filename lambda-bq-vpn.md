Here’s **how to extend k6-based load testing and metrics reporting to other AWS services** like Lambda and VPN—and how to collect and combine those metrics for unified HTML reports:

---

## **1. Adjust k6 Script to Target AWS Lambda and VPN Endpoints**

### **a. Invoke Lambda via API Gateway (with k6)**
You typically expose Lambda functions through API Gateway, which k6 can target via HTTP requests.

```javascript name=invoke_lambda.js
import http from "k6/http";
import { check } from "k6";

export default function () {
    // Replace with your API Gateway endpoint
    const url = "https://your-api-id.execute-api.region.amazonaws.com/prod/lambda-endpoint";
    const payload = JSON.stringify({ key: "value" });

    const params = {
        headers: { "Content-Type": "application/json" }
    };

    let res = http.post(url, payload, params);

    check(res, {
        "status is 200": (r) => r.status === 200,
    });

    // You can also log timings and errors for your custom HTML report
    console.log(JSON.stringify(res.timings));
}
```
- **Run:**  
  `k6 run --out html invoke_lambda.js`  
  This generates an HTML report like your Kinesis test.

### **b. Test VPN Endpoints (Transit VPC)**
- For VPN testing, use k6 to send requests through the VPN tunnel to a reachable endpoint in the VPC.
- Example:  
  ```javascript
  import http from "k6/http";
  export default function () {
      // Replace with an IP or DNS name behind the VPN
      let res = http.get("http://vpn-endpoint.internal");
      console.log(res.status);
  }
  // k6 can report response time, errors, etc., for the VPN tunnel connection.
  ```

---

## **2. Collect AWS Service Metrics (Lambda, VPN) via CloudWatch**

Use SDKs (Node.js, Python, etc.) to fetch metrics programmatically.

### **Lambda: Invocations & Errors**
```javascript name=fetch_lambda_metrics.js
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({ region: 'your-region' });

async function getLambdaMetrics() {
    const params = {
        Namespace: 'AWS/Lambda',
        MetricName: 'Invocations',
        Dimensions: [{ Name: 'FunctionName', Value: 'your-lambda-name' }],
        StartTime: new Date(Date.now() - 3600 * 1000),
        EndTime: new Date(),
        Period: 300,
        Statistics: ['Sum']
    };
    const result = await cloudwatch.getMetricStatistics(params).promise();
    console.log(result);
}
getLambdaMetrics();
```

### **VPN (Transit VPC) Tunnel State**
```javascript name=fetch_vpn_metrics.js
const params = {
    Namespace: 'AWS/VPN',
    MetricName: 'TunnelState',
    Dimensions: [{ Name: 'VpnId', Value: 'your-vpn-id' }],
    StartTime: new Date(Date.now() - 3600 * 1000),
    EndTime: new Date(),
    Period: 300,
    Statistics: ['Average']
};
// Use AWS SDK as above
```

---

## **3. Collect GCP BigQuery Metrics**

Use the GCP Monitoring API or BigQuery API—see previous Python example for report generation.

---

## **4. Create Unified HTML Report**

Combine your k6 HTML output and CloudWatch/GCP metrics into a dashboard.

````markdown name=combined_report.html
<html>
<head><title>Unified Metrics Report</title></head>
<body>
<h2>k6 Test Results (Kinesis/Lambda/VPN)</h2>
<iframe src="k6_report.html" width="100%" height="300"></iframe>
<h2>AWS Lambda Metrics</h2>
<iframe src="lambda_metrics.html" width="100%" height="200"></iframe>
<h2>VPN Tunnel State</h2>
<iframe src="vpn_metrics.html" width="100%" height="200"></iframe>
<h2>BigQuery Metrics</h2>
<iframe src="bigquery_metrics.html" width="100%" height="200"></iframe>
</body>
</html>
````

---

## **Summary Workflow**

1. **Write k6 scripts for each service endpoint (Kinesis, Lambda, VPN, etc.)**
2. **Run k6 tests and generate HTML reports.**
3. **Use AWS/GCP SDKs to fetch CloudWatch/Monitoring metrics and export those as HTML.**
4. **Combine all reports into a single dashboard for unified viewing.**

---

### **This demonstrates how you can showcase end-to-end metrics and performance, not just for Kinesis but for Lambda, VPN, and BigQuery as well.**

Let me know if you want full code for a particular service, or help automating these steps!