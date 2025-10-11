# Memory Analysis Tools

This directory contains a comprehensive suite of memory analysis tools for monitoring and analyzing memory usage in your Next.js backend application. These tools are designed to help identify memory leaks, optimize performance, and validate memory improvements.

## 🛠️ Available Tools

### 1. Memory Monitor (`memory-monitor.js`)

Real-time memory usage tracking with detailed statistics and leak detection.

**Features:**

- Real-time heap and RSS monitoring
- Garbage collection tracking
- Memory leak detection
- Configurable intervals and duration
- JSON output support

**Usage:**

```bash
# Basic monitoring (1 minute)
npm run memory:monitor

# Custom monitoring
node scripts/memory-monitor.js -i 500 -d 300000 -o results.json

# Options:
# -i, --interval <ms>    Monitoring interval (default: 1000ms)
# -d, --duration <ms>    Monitoring duration (default: 60000ms)
# -o, --output <file>    Save results to JSON file
# -l, --log <file>       Save logs to file
```

### 2. Memory Profiler (`memory-profiler.js`)

Heap snapshot analysis and comparison for deep memory investigation.

**Features:**

- Heap snapshot generation
- Interactive profiling mode
- Snapshot comparison
- Chrome DevTools integration

**Usage:**

```bash
# Interactive profiling
npm run memory:profile

# Custom output directory
node scripts/memory-profiler.js -o ./snapshots

# Compare existing snapshots
node scripts/memory-profiler.js -c snapshot1.heapsnapshot snapshot2.heapsnapshot
```

### 3. Load Tester (`load-test.js`)

HTTP load testing specifically designed for memory analysis under load.

**Features:**

- Realistic tRPC endpoint testing
- Configurable concurrency and duration
- Response time analysis
- Error rate tracking

**Usage:**

```bash
# Basic load test
npm run memory:load-test

# Custom load test
node scripts/load-test.js -c 20 -d 120000 -u http://localhost:3000

# Options:
# -u, --url <url>         Target URL (default: http://localhost:3000)
# -c, --concurrency <num>  Concurrent requests (default: 10)
# -d, --duration <ms>     Test duration (default: 60000ms)
# -r, --ramp-up <ms>      Ramp up time (default: 5000ms)
```

### 4. Baseline Test (`baseline-test.js`)

Establishes memory usage baseline through controlled operations.

**Features:**

- Step-by-step memory measurement
- Simulates real application operations
- Baseline comparison
- Growth tracking

**Usage:**

```bash
# Run baseline test
npm run memory:baseline

# Custom output and comparison
node scripts/baseline-test.js -o my-baseline.json -c previous-baseline.json
```

### 5. Memory Reporter (`memory-reporter.js`)

Generates comprehensive HTML reports from all analysis data.

**Features:**

- Interactive HTML reports
- Charts and visualizations
- Recommendations
- Multi-tool integration

**Usage:**

```bash
# Generate report
npm run memory:report

# Custom report
node scripts/memory-reporter.js -i ./results -o report.html
```

## 🚀 Quick Start

### 1. Basic Memory Analysis

```bash
# Start your application
pnpm dev

# In another terminal, run baseline test
npm run memory:baseline

# Monitor memory during usage
npm run memory:monitor -d 120000

# Generate report
npm run memory:report
```

### 2. Load Testing with Memory Monitoring

```bash
# Start your application
pnpm dev

# Run stress test with memory monitoring
npm run memory:stress-test
```

### 3. Complete Analysis Pipeline

```bash
# Run full analysis suite
npm run memory:analyze
```

## 📊 Understanding the Results

### Memory Monitor Output

- **Heap Used**: JavaScript heap memory currently in use
- **Heap Total**: Total heap memory allocated
- **RSS**: Resident Set Size (total process memory)
- **External**: Memory used by C++ objects
- **GC Stats**: Garbage collection frequency and duration

### Key Indicators

- ✅ **Healthy**: Heap growth < 50MB, GC runs < 100, RSS growth < 100MB
- ⚠️ **Warning**: Heap growth 50-100MB, frequent GC, moderate RSS growth
- ❌ **Critical**: Heap growth > 100MB, very frequent GC, high RSS growth

### Load Test Metrics

- **Requests/Second**: Application throughput
- **Error Rate**: Percentage of failed requests
- **Response Times**: Latency percentiles (p50, p95, p99)

## 🔍 Memory Leak Detection

### Step-by-Step Leak Detection

1. **Establish Baseline**: Run `npm run memory:baseline`
2. **Monitor Usage**: Run `npm run memory:monitor` during normal operation
3. **Apply Load**: Run `npm run memory:load-test` while monitoring
4. **Take Snapshots**: Use `npm run memory:profile` for detailed analysis
5. **Generate Report**: Run `npm run memory:report` for comprehensive analysis

### Common Leak Patterns

- **Event Listeners**: Not removing event listeners
- **Timers**: Not clearing intervals/timeouts
- **Closures**: Variables held in closures
- **Database Connections**: Not properly closing connections
- **Queue Accumulation**: Jobs building up in BullMQ

## 🛠️ Advanced Usage

### Custom Memory Monitoring

```javascript
const MemoryMonitor = require("./scripts/memory-monitor");

const monitor = new MemoryMonitor({
  interval: 500,
  duration: 300000,
  outputFile: "./custom-monitoring.json",
});

monitor.start();
```

### Profiling Specific Operations

```javascript
const MemoryProfiler = require("./scripts/memory-profiler");

const profiler = new MemoryProfiler();

await profiler.startProfiling();
await profiler.profileDuringOperation(() => {
  // Your operation here
}, "my-operation");
await profiler.stopProfiling();
```

### Automated Testing

```bash
# Create a test script
cat > memory-test.sh << 'EOF'
#!/bin/bash
echo "Starting memory analysis..."

# Start application
pnpm dev &
APP_PID=$!
sleep 10

# Run baseline
npm run memory:baseline

# Monitor during load
npm run memory:monitor -d 60000 &
MONITOR_PID=$!

# Apply load
npm run memory:load-test -c 15 -d 45000

# Stop monitoring
kill $MONITOR_PID
wait $MONITOR_PID

# Generate report
npm run memory:report

# Stop application
kill $APP_PID
echo "Analysis complete!"
EOF

chmod +x memory-test.sh
./memory-test.sh
```

## 📈 Integration with CI/CD

### GitHub Actions Example

```yaml
name: Memory Analysis
on: [push, pull_request]

jobs:
  memory-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: "18"

      - run: npm ci
      - run: npm run memory:baseline
      - run: npm run memory:stress-test
      - run: npm run memory:report

      - uses: actions/upload-artifact@v2
        with:
          name: memory-report
          path: memory-analysis-report.html
```

## 🔧 Configuration

### Environment Variables

- `NODE_OPTIONS="--max-old-space-size=4096"`: Increase Node.js memory limit
- `NODE_ENV=production`: Test in production-like environment

### Monitoring Configuration

Create `memory-config.json`:

```json
{
  "monitor": {
    "interval": 1000,
    "duration": 300000,
    "thresholds": {
      "heapGrowth": 52428800,
      "rssGrowth": 104857600,
      "gcFrequency": 100
    }
  },
  "loadTest": {
    "concurrency": 10,
    "duration": 60000,
    "rampUp": 5000
  }
}
```

## 🐛 Troubleshooting

### Common Issues

1. **"Cannot find module" errors**

   ```bash
   cd apps/web
   npm install
   ```

2. **Permission denied on scripts**

   ```bash
   chmod +x scripts/*.js
   ```

3. **Memory monitoring not working**

   - Ensure `--expose-gc` flag is used
   - Check Node.js version (v14+ recommended)

4. **Load test connection refused**

   - Ensure application is running on target port
   - Check firewall settings

5. **Heap snapshots too large**
   - Reduce monitoring duration
   - Increase available disk space

### Performance Impact

- Memory monitoring has minimal performance impact
- Load testing will stress your application
- Heap snapshots can temporarily increase memory usage

## 📚 Additional Resources

- [Node.js Memory Debugging](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Chrome DevTools Memory Tab](https://developer.chrome.com/docs/devtools/memory/)
- [BullMQ Memory Management](https://docs.bullmq.io/guide/memory)
- [V8 Memory Statistics](https://nodejs.org/api/v8.html#v8_v8_getheaptatistics)

## 🤝 Contributing

To add new memory analysis features:

1. Create new script in `scripts/` directory
2. Add npm script to `package.json`
3. Update this README
4. Test with various scenarios

## 📄 License

These tools are part of the main project and follow the same license terms.
