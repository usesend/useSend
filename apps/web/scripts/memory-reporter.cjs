#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

class MemoryReporter {
  constructor(options = {}) {
    this.inputDir = options.inputDir || "./";
    this.outputFile = options.outputFile || "./memory-analysis-report.html";
    this.data = {
      monitor: null,
      profiler: null,
      loadTest: null,
      baseline: null,
      comparison: null,
    };
  }

  formatBytes(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  loadData() {
    // Load memory monitor results
    const monitorFiles = fs
      .readdirSync(this.inputDir)
      .filter((f) => f.includes("memory") && f.endsWith(".json"));
    if (monitorFiles.length > 0) {
      try {
        this.data.monitor = JSON.parse(
          fs.readFileSync(path.join(this.inputDir, monitorFiles[0]), "utf8"),
        );
      } catch (e) {
        console.log("Could not load monitor data");
      }
    }

    // Load baseline data
    const baselineFiles = fs
      .readdirSync(this.inputDir)
      .filter((f) => f.includes("baseline") && f.endsWith(".json"));
    if (baselineFiles.length > 0) {
      try {
        this.data.baseline = JSON.parse(
          fs.readFileSync(path.join(this.inputDir, baselineFiles[0]), "utf8"),
        );
      } catch (e) {
        console.log("Could not load baseline data");
      }
    }

    // Look for load test results (could be in console output or saved files)
    const loadTestFiles = fs
      .readdirSync(this.inputDir)
      .filter((f) => f.includes("load-test") && f.endsWith(".json"));
    if (loadTestFiles.length > 0) {
      try {
        this.data.loadTest = JSON.parse(
          fs.readFileSync(path.join(this.inputDir, loadTestFiles[0]), "utf8"),
        );
      } catch (e) {
        console.log("Could not load load test data");
      }
    }
  }

  generateHTMLReport() {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Memory Analysis Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
        }
        .content {
            padding: 30px;
        }
        .section {
            margin-bottom: 40px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
        }
        .section-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e0e0e0;
        }
        .section-header h2 {
            margin: 0;
            color: #333;
            font-size: 1.5em;
        }
        .section-content {
            padding: 20px;
        }
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .metric {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            text-align: center;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .metric-label {
            color: #666;
            font-size: 0.9em;
        }
        .chart-container {
            position: relative;
            height: 400px;
            margin: 20px 0;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 15px;
            border-radius: 6px;
            margin: 10px 0;
        }
        .error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
            padding: 15px;
            border-radius: 6px;
            margin: 10px 0;
        }
        .success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 15px;
            border-radius: 6px;
            margin: 10px 0;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-good { background: #28a745; }
        .status-warning { background: #ffc107; }
        .status-error { background: #dc3545; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            border-top: 1px solid #e0e0e0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Memory Analysis Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="content">
            ${this.generateSummarySection()}
            ${this.generateMonitorSection()}
            ${this.generateBaselineSection()}
            ${this.generateLoadTestSection()}
            ${this.generateRecommendationsSection()}
        </div>
        
        <div class="footer">
            <p>Report generated by Memory Analysis Tools</p>
        </div>
    </div>

    <script>
        ${this.generateChartScripts()}
    </script>
</body>
</html>`;

    fs.writeFileSync(this.outputFile, html);
    console.log(`📊 HTML report generated: ${this.outputFile}`);
  }

  generateSummarySection() {
    const hasData =
      this.data.monitor || this.data.baseline || this.data.loadTest;

    if (!hasData) {
      return `
        <div class="section">
            <div class="section-header">
                <h2>📊 Summary</h2>
            </div>
            <div class="section-content">
                <div class="warning">
                    <strong>No data available</strong><br>
                    Please run memory analysis tools first to generate data for this report.
                </div>
            </div>
        </div>
      `;
    }

    let overallStatus = "status-good";
    let issues = [];

    // Check for memory issues
    if (this.data.monitor?.report) {
      const report = this.data.monitor.report;
      if (report.heap.growth > 50 * 1024 * 1024) {
        overallStatus = "status-warning";
        issues.push("High heap growth detected");
      }
      if (report.rss.growth > 100 * 1024 * 1024) {
        overallStatus = "status-error";
        issues.push("Very high RSS growth detected");
      }
    }

    return `
      <div class="section">
          <div class="section-header">
              <h2>📊 Summary</h2>
          </div>
          <div class="section-content">
              <div class="metrics">
                  <div class="metric">
                      <div class="metric-value">
                          <span class="status-indicator ${overallStatus}"></span>
                          ${overallStatus === "status-good" ? "Good" : overallStatus === "status-warning" ? "Warning" : "Critical"}
                      </div>
                      <div class="metric-label">Overall Status</div>
                  </div>
                  ${
                    this.data.monitor
                      ? `
                  <div class="metric">
                      <div class="metric-value">${this.data.monitor.snapshots?.length || 0}</div>
                      <div class="metric-label">Memory Snapshots</div>
                  </div>
                  `
                      : ""
                  }
                  ${
                    this.data.baseline
                      ? `
                  <div class="metric">
                      <div class="metric-value">${this.data.baseline.totalSteps || 0}</div>
                      <div class="metric-label">Baseline Steps</div>
                  </div>
                  `
                      : ""
                  }
                  ${
                    this.data.loadTest
                      ? `
                  <div class="metric">
                      <div class="metric-value">${(this.data.loadTest.requestsPerSecond || 0).toFixed(0)}</div>
                      <div class="metric-label">Requests/Second</div>
                  </div>
                  `
                      : ""
                  }
              </div>
              
              ${
                issues.length > 0
                  ? `
              <div class="warning">
                  <strong>Issues Detected:</strong><br>
                  ${issues.map((issue) => `• ${issue}`).join("<br>")}
              </div>
              `
                  : ""
              }
              
              ${
                issues.length === 0 && this.data.monitor
                  ? `
              <div class="success">
                  <strong>✅ No critical memory issues detected</strong><br>
                  Memory usage appears to be within normal ranges.
              </div>
              `
                  : ""
              }
          </div>
      </div>
    `;
  }

  generateMonitorSection() {
    if (!this.data.monitor) {
      return "";
    }

    const report = this.data.monitor.report;
    const snapshots = this.data.monitor.snapshots || [];

    if (!report) {
      return `
      <div class="section">
          <div class="section-header">
              <h2>🔍 Memory Monitor Analysis</h2>
          </div>
          <div class="section-content">
              <div class="warning">
                  <strong>No Report Data:</strong> Memory monitor data is available but no report was generated.
              </div>
          </div>
      </div>
      `;
    }

    return `
      <div class="section">
          <div class="section-header">
              <h2>🔍 Memory Monitor Analysis</h2>
          </div>
          <div class="section-content">
              <div class="metrics">
                  <div class="metric">
                      <div class="metric-value">${report.heap ? this.formatBytes(report.heap.peak) : "N/A"}</div>
                      <div class="metric-label">Peak Heap</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${report.heap ? this.formatBytes(report.heap.growth) : "N/A"}</div>
                      <div class="metric-label">Heap Growth</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${report.rss ? this.formatBytes(report.rss.peak) : "N/A"}</div>
                      <div class="metric-label">Peak RSS</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${report.gc ? report.gc.total : "N/A"}</div>
                      <div class="metric-label">GC Runs</div>
                  </div>
              </div>
              
              <div class="chart-container">
                  <canvas id="memoryChart"></canvas>
              </div>
              
              ${
                report.heap && report.heap.growth > 50 * 1024 * 1024
                  ? `
              <div class="warning">
                  <strong>High Memory Growth:</strong> Heap grew by ${this.formatBytes(report.heap.growth)} during monitoring period.
              </div>
              `
                  : ""
              }
              
              ${
                report.gc && report.gc.total > 100
                  ? `
              <div class="warning">
                  <strong>Frequent Garbage Collection:</strong> ${report.gc.total} GC runs detected, which may indicate memory pressure.
              </div>
              `
                  : ""
              }
          </div>
      </div>
    `;
  }

  generateBaselineSection() {
    if (!this.data.baseline) {
      return "";
    }

    const summary = this.data.baseline.summary;

    return `
      <div class="section">
          <div class="section-header">
              <h2>📏 Baseline Test Results</h2>
          </div>
          <div class="section-content">
              <div class="metrics">
                  <div class="metric">
                      <div class="metric-value">${this.formatBytes(summary.peakHeap)}</div>
                      <div class="metric-label">Peak Heap</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${this.formatBytes(summary.totalHeapGrowth)}</div>
                      <div class="metric-label">Total Heap Growth</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${this.formatBytes(summary.peakRSS)}</div>
                      <div class="metric-label">Peak RSS</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${(summary.totalDuration / 1000).toFixed(1)}s</div>
                      <div class="metric-label">Test Duration</div>
                  </div>
              </div>
              
              <h3>Step-by-Step Analysis</h3>
              <table>
                  <thead>
                      <tr>
                          <th>Step</th>
                          <th>Duration</th>
                          <th>Heap Growth</th>
                          <th>RSS Growth</th>
                          <th>Status</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${this.data.baseline.steps
                        .map(
                          (step) => `
                          <tr>
                              <td>${step.name}</td>
                              <td>${(step.duration / 1000).toFixed(2)}s</td>
                              <td>${this.formatBytes(step.stats.heap.growth)}</td>
                              <td>${this.formatBytes(step.stats.rss.growth)}</td>
                              <td>
                                  <span class="status-indicator ${step.stats.heap.growth > 10 * 1024 * 1024 ? "status-warning" : "status-good"}"></span>
                                  ${step.stats.heap.growth > 10 * 1024 * 1024 ? "High" : "Normal"}
                              </td>
                          </tr>
                      `,
                        )
                        .join("")}
                  </tbody>
              </table>
          </div>
      </div>
    `;
  }

  generateLoadTestSection() {
    if (!this.data.loadTest) {
      return "";
    }

    const test = this.data.loadTest;

    return `
      <div class="section">
          <div class="section-header">
              <h2>⚡ Load Test Results</h2>
          </div>
          <div class="section-content">
              <div class="metrics">
                  <div class="metric">
                      <div class="metric-value">${test.requestsPerSecond?.toFixed(0) || "N/A"}</div>
                      <div class="metric-label">Requests/Second</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${test.totalRequests || "N/A"}</div>
                      <div class="metric-label">Total Requests</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${test.errorRate?.toFixed(1) || "N/A"}%</div>
                      <div class="metric-label">Error Rate</div>
                  </div>
                  <div class="metric">
                      <div class="metric-value">${test.responseTimes?.avg?.toFixed(0) || "N/A"}ms</div>
                      <div class="metric-label">Avg Response Time</div>
                  </div>
              </div>
              
              ${
                test.errorRate > 5
                  ? `
              <div class="error">
                  <strong>High Error Rate:</strong> ${test.errorRate.toFixed(1)}% of requests failed during load test.
              </div>
              `
                  : ""
              }
              
              ${
                test.responseTimes?.p95 > 1000
                  ? `
              <div class="warning">
                  <strong>Slow Response Times:</strong> 95th percentile response time is ${test.responseTimes.p95.toFixed(0)}ms.
              </div>
              `
                  : ""
              }
          </div>
      </div>
    `;
  }

  generateRecommendationsSection() {
    const recommendations = [];

    if (this.data.monitor?.report) {
      const report = this.data.monitor.report;

      if (report.heap.growth > 50 * 1024 * 1024) {
        recommendations.push({
          type: "warning",
          title: "Monitor Heap Growth",
          description:
            "Heap grew significantly during monitoring. Consider investigating potential memory leaks.",
        });
      }

      if (report.gc.total > 100) {
        recommendations.push({
          type: "info",
          title: "Optimize Memory Usage",
          description:
            "Frequent garbage collection detected. Review object creation patterns and consider object pooling.",
        });
      }
    }

    if (this.data.loadTest?.errorRate > 5) {
      recommendations.push({
        type: "error",
        title: "Fix Error Handling",
        description:
          "High error rate during load testing. Review error handling and resource management.",
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: "success",
        title: "Good Memory Health",
        description:
          "No significant memory issues detected. Continue monitoring during production usage.",
      });
    }

    return `
      <div class="section">
          <div class="section-header">
              <h2>💡 Recommendations</h2>
          </div>
          <div class="section-content">
              ${recommendations
                .map(
                  (rec) => `
                  <div class="${rec.type === "error" ? "error" : rec.type === "warning" ? "warning" : rec.type === "success" ? "success" : ""}">
                      <strong>${rec.title}</strong><br>
                      ${rec.description}
                  </div>
              `,
                )
                .join("")}
              
              <h3>General Memory Optimization Tips</h3>
              <ul>
                  <li>Monitor memory usage regularly, especially during high traffic periods</li>
                  <li>Use heap snapshots to identify memory leaks</li>
                  <li>Implement proper cleanup in event handlers and timers</li>
                  <li>Consider using object pooling for frequently created/destroyed objects</li>
                  <li>Review database connection pooling settings</li>
                  <li>Monitor queue sizes in BullMQ to prevent job accumulation</li>
              </ul>
          </div>
      </div>
    `;
  }

  generateChartScripts() {
    if (!this.data.monitor?.snapshots) {
      return "";
    }

    const snapshots = this.data.monitor.snapshots;
    const labels = snapshots.map((_, i) => `${i}s`);
    const heapData = snapshots.map((s) => s.memory.heapUsed / 1024 / 1024);
    const rssData = snapshots.map((s) => s.memory.rss / 1024 / 1024);

    return `
        // Memory usage chart
        const ctx = document.getElementById('memoryChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(labels)},
                datasets: [{
                    label: 'Heap (MB)',
                    data: ${JSON.stringify(heapData)},
                    borderColor: 'rgb(102, 126, 234)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.1
                }, {
                    label: 'RSS (MB)',
                    data: ${JSON.stringify(rssData)},
                    borderColor: 'rgb(118, 75, 162)',
                    backgroundColor: 'rgba(118, 75, 162, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Memory Usage Over Time'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Memory (MB)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    }
                }
            }
        });
    `;
  }

  generateReport() {
    console.log("📊 Generating memory analysis report...");

    this.loadData();
    this.generateHTMLReport();

    console.log("✅ Report generation completed");
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--input-dir":
      case "-i":
        options.inputDir = args[++i];
        break;
      case "--output":
      case "-o":
        options.outputFile = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
Memory Reporter - Generate comprehensive memory analysis reports

Usage: node memory-reporter.js [options]

Options:
  -i, --input-dir <dir>   Directory containing memory analysis files (default: ./)
  -o, --output <file>     Output HTML report file (default: ./memory-analysis-report.html)
  -h, --help              Show this help

Examples:
  node memory-reporter.js                           # Generate report from current directory
  node memory-reporter.js -i ./results -o report.html  # Custom input/output
        `);
        process.exit(0);
    }
  }

  const reporter = new MemoryReporter(options);
  reporter.generateReport();
}

module.exports = MemoryReporter;
