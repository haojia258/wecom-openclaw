# Data Adapters

统一不同数据源 JSON 到标准结构：

```json
{
  "spend": 0,
  "roi": 0,
  "ctr": 0,
  "cvr": 0,
  "impressions": 0,
  "clicks": 0,
  "orders": 0,
  "gmv": 0,
  "updatedAt": "ISO8601",
  "source": "ads|doudian",
  "missingFields": []
}
```

- 只做 normalize
- 不做采集
- 不调用外部 API
- 缺失字段写入 `missingFields`
