#!/usr/bin/env node

const v8 = require("v8");
const fs = require("fs");
const path = require("path");

class BaselineTest {
  constructor(options = {}) {
    this.outputFile = options.outputFile || "./memory-baseline.json";
    this.steps = [];
    this.currentStep = null;
    this.baseline = null;
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

  getMemoryInfo() {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      heap: {
        total: heapStats.total_heap_size,
        used: heapStats.used_heap_size,
        limit: heapStats.heap_size_limit,
        available: heapStats.heap_size_limit - heapStats.used_heap_size,
        executable: heapStats.total_physical_size,
        peak: heapStats.peak_malloced_memory,
      },
    };
  }

  startStep(name) {
    if (this.currentStep) {
      this.endStep();
    }

    console.log(`📍 Starting step: ${name}`);

    // Force GC before step
    if (global.gc) {
      global.gc();
    }

    this.currentStep = {
      name,
      startTime: Date.now(),
      startMemory: this.getMemoryInfo(),
      measurements: [],
    };

    // Take initial measurement
    this.currentStep.measurements.push(this.currentStep.startMemory);
  }

  measure(label = "") {
    if (!this.currentStep) {
      console.log("No step in progress");
      return;
    }

    const measurement = this.getMemoryInfo();
    measurement.label = label;
    this.currentStep.measurements.push(measurement);

    const memDiff =
      measurement.memory.heapUsed -
      this.currentStep.startMemory.memory.heapUsed;
    console.log(
      `  📊 ${label || "Measurement"}: Heap ${this.formatBytes(measurement.memory.heapUsed)} (${memDiff > 0 ? "+" : ""}${this.formatBytes(memDiff)})`,
    );
  }

  endStep() {
    if (!this.currentStep) {
      console.log("No step to end");
      return;
    }

    // Force GC before ending
    if (global.gc) {
      global.gc();
    }

    const endMemory = this.getMemoryInfo();
    this.currentStep.endTime = Date.now();
    this.currentStep.endMemory = endMemory;
    this.currentStep.duration =
      this.currentStep.endTime - this.currentStep.startTime;

    // Calculate step statistics
    const heapUsages = this.currentStep.measurements.map(
      (m) => m.memory.heapUsed,
    );
    const rssUsages = this.currentStep.measurements.map((m) => m.memory.rss);

    this.currentStep.stats = {
      duration: this.currentStep.duration,
      heap: {
        start: this.currentStep.startMemory.memory.heapUsed,
        end: endMemory.memory.heapUsed,
        peak: Math.max(...heapUsages),
        min: Math.min(...heapUsages),
        growth:
          endMemory.memory.heapUsed -
          this.currentStep.startMemory.memory.heapUsed,
      },
      rss: {
        start: this.currentStep.startMemory.memory.rss,
        end: endMemory.memory.rss,
        peak: Math.max(...rssUsages),
        min: Math.min(...rssUsages),
        growth: endMemory.memory.rss - this.currentStep.startMemory.memory.rss,
      },
    };

    console.log(
      `  ✅ Step completed in ${(this.currentStep.duration / 1000).toFixed(2)}s`,
    );
    console.log(
      `  📈 Heap growth: ${this.formatBytes(this.currentStep.stats.heap.growth)}`,
    );
    console.log(
      `  📈 RSS growth: ${this.formatBytes(this.currentStep.stats.rss.growth)}`,
    );

    this.steps.push(this.currentStep);
    this.currentStep = null;
  }

  async runBaselineTest() {
    console.log("🚀 Starting memory baseline test...\n");

    // Step 1: Cold start measurement
    this.startStep("Cold Start");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.measure("After 1s");
    this.endStep();

    // Step 2: Module loading simulation
    this.startStep("Module Loading");
    // Simulate loading various modules
    const modules = ["fs", "path", "crypto", "util", "events"];
    for (const module of modules) {
      require(module);
      this.measure(`After require('${module}')`);
    }
    this.endStep();

    // Step 3: Database connection simulation
    this.startStep("Database Connection");
    // Simulate database connection patterns
    const connections = [];
    for (let i = 0; i < 5; i++) {
      connections.push({ id: i, connected: true, query: "SELECT * FROM test" });
      this.measure(`Connection ${i + 1}`);
    }
    // Clear connections
    connections.length = 0;
    this.measure("After clearing connections");
    this.endStep();

    // Step 4: Redis connection simulation
    this.startStep("Redis Connection");
    // Simulate Redis operations
    const redisData = new Map();
    for (let i = 0; i < 100; i++) {
      redisData.set(`key:${i}`, `value:${i}`.repeat(10));
    }
    this.measure("After storing 100 keys");

    // Simulate cache operations
    for (let i = 0; i < 50; i++) {
      redisData.get(`key:${i}`);
      redisData.delete(`key:${i}`);
    }
    this.measure("After cache operations");
    this.endStep();

    // Step 5: Queue processing simulation
    this.startStep("Queue Processing");
    // Simulate BullMQ-like operations
    const jobs = [];
    for (let i = 0; i < 20; i++) {
      jobs.push({
        id: `job-${i}`,
        data: { payload: "x".repeat(1000) },
        status: "waiting",
      });
    }
    this.measure("After creating 20 jobs");

    // Simulate processing
    jobs.forEach((job) => {
      job.status = "processing";
      job.result = "processed".repeat(10);
    });
    this.measure("After processing jobs");

    // Clear jobs
    jobs.length = 0;
    this.measure("After clearing jobs");
    this.endStep();

    // Step 6: Email processing simulation
    this.startStep("Email Processing");
    // Simulate email operations
    const emails = [];
    for (let i = 0; i < 10; i++) {
      emails.push({
        id: `email-${i}`,
        to: `test${i}@example.com`,
        from: "sender@example.com",
        subject: `Test Email ${i}`,
        html: `<h1>Test ${i}</h1>`.repeat(50),
        text: `Test ${i}`.repeat(100),
        attachments: [
          { name: "file1.txt", data: "x".repeat(5000) },
          { name: "file2.txt", data: "y".repeat(3000) },
        ],
      });
    }
    this.measure("After creating 10 emails");

    // Simulate sending
    emails.forEach((email) => {
      email.status = "sent";
      email.sesId = `ses-${Math.random()}`;
    });
    this.measure("After sending emails");

    // Clean up attachments
    emails.forEach((email) => {
      delete email.attachments;
    });
    this.measure("After cleaning attachments");
    this.endStep();

    // Step 7: Memory stress test
    this.startStep("Memory Stress");
    const arrays = [];
    for (let i = 0; i < 10; i++) {
      arrays.push(new Array(10000).fill(`stress-test-${i}`));
      this.measure(`Array ${i + 1}`);
    }

    // Clear arrays
    arrays.length = 0;
    this.measure("After clearing arrays");
    this.endStep();

    // Step 8: Final cleanup
    this.startStep("Final Cleanup");
    if (global.gc) {
      global.gc();
      this.measure("After forced GC");
    }

    // Final measurement
    await new Promise((resolve) => setTimeout(resolve, 2000));
    this.measure("Final measurement");
    this.endStep();

    // Generate baseline
    this.generateBaseline();
  }

  generateBaseline() {
    const baseline = {
      timestamp: Date.now(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      totalSteps: this.steps.length,
      steps: this.steps.map((step) => ({
        name: step.name,
        duration: step.duration,
        stats: step.stats,
        measurements: step.measurements.length,
      })),
      summary: this.calculateSummary(),
    };

    this.baseline = baseline;

    // Save to file
    fs.writeFileSync(this.outputFile, JSON.stringify(baseline, null, 2));

    console.log("\n=== BASELINE TEST COMPLETED ===");
    console.log(`Baseline saved to: ${this.outputFile}`);
    console.log(`Total steps: ${baseline.totalSteps}`);
    console.log(
      `Total duration: ${(baseline.summary.totalDuration / 1000).toFixed(2)}s`,
    );
    console.log(`Peak heap: ${this.formatBytes(baseline.summary.peakHeap)}`);
    console.log(`Peak RSS: ${this.formatBytes(baseline.summary.peakRSS)}`);
    console.log(
      `Total heap growth: ${this.formatBytes(baseline.summary.totalHeapGrowth)}`,
    );
    console.log(
      `Total RSS growth: ${this.formatBytes(baseline.summary.totalRSSGrowth)}`,
    );

    return baseline;
  }

  calculateSummary() {
    const allHeapUsages = [];
    const allRSSUsages = [];
    let totalDuration = 0;
    let totalHeapGrowth = 0;
    let totalRSSGrowth = 0;

    this.steps.forEach((step) => {
      totalDuration += step.duration;
      totalHeapGrowth += step.stats.heap.growth;
      totalRSSGrowth += step.stats.rss.growth;

      step.measurements.forEach((measurement) => {
        allHeapUsages.push(measurement.memory.heapUsed);
        allRSSUsages.push(measurement.memory.rss);
      });
    });

    return {
      totalDuration,
      peakHeap: Math.max(...allHeapUsages),
      peakRSS: Math.max(...allRSSUsages),
      minHeap: Math.min(...allHeapUsages),
      minRSS: Math.min(...allRSSUsages),
      avgHeap: allHeapUsages.reduce((a, b) => a + b, 0) / allHeapUsages.length,
      avgRSS: allRSSUsages.reduce((a, b) => a + b, 0) / allRSSUsages.length,
      totalHeapGrowth,
      totalRSSGrowth,
    };
  }

  compareWithBaseline(otherBaselineFile) {
    if (!this.baseline) {
      console.log("No baseline to compare with");
      return;
    }

    if (!fs.existsSync(otherBaselineFile)) {
      console.log(`Baseline file not found: ${otherBaselineFile}`);
      return;
    }

    const otherBaseline = JSON.parse(
      fs.readFileSync(otherBaselineFile, "utf8"),
    );

    console.log("\n=== BASELINE COMPARISON ===");
    console.log(`Current: ${new Date(this.baseline.timestamp).toISOString()}`);
    console.log(`Previous: ${new Date(otherBaseline.timestamp).toISOString()}`);

    const current = this.baseline.summary;
    const previous = otherBaseline.summary;

    const heapGrowthDiff = current.totalHeapGrowth - previous.totalHeapGrowth;
    const rssGrowthDiff = current.totalRSSGrowth - previous.totalRSSGrowth;
    const peakHeapDiff = current.peakHeap - previous.peakHeap;
    const peakRSSDiff = current.peakRSS - previous.peakRSS;

    console.log("\nHeap Growth:");
    console.log(`  Current: ${this.formatBytes(current.totalHeapGrowth)}`);
    console.log(`  Previous: ${this.formatBytes(previous.totalHeapGrowth)}`);
    console.log(
      `  Difference: ${heapGrowthDiff > 0 ? "+" : ""}${this.formatBytes(heapGrowthDiff)}`,
    );

    console.log("\nRSS Growth:");
    console.log(`  Current: ${this.formatBytes(current.totalRSSGrowth)}`);
    console.log(`  Previous: ${this.formatBytes(previous.totalRSSGrowth)}`);
    console.log(
      `  Difference: ${rssGrowthDiff > 0 ? "+" : ""}${this.formatBytes(rssGrowthDiff)}`,
    );

    console.log("\nPeak Memory:");
    console.log(
      `  Heap: ${this.formatBytes(current.peakHeap)} (${peakHeapDiff > 0 ? "+" : ""}${this.formatBytes(peakHeapDiff)})`,
    );
    console.log(
      `  RSS: ${this.formatBytes(current.peakRSS)} (${peakRSSDiff > 0 ? "+" : ""}${this.formatBytes(peakRSSDiff)})`,
    );

    // Warnings for significant changes
    if (Math.abs(heapGrowthDiff) > 10 * 1024 * 1024) {
      console.log(
        `⚠️  Significant heap growth change: ${this.formatBytes(heapGrowthDiff)}`,
      );
    }

    if (Math.abs(rssGrowthDiff) > 20 * 1024 * 1024) {
      console.log(
        `⚠️  Significant RSS growth change: ${this.formatBytes(rssGrowthDiff)}`,
      );
    }
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
      case "--output":
      case "-o":
        options.outputFile = args[++i];
        break;
      case "--compare":
      case "-c":
        const baselineFile = args[++i];
        const tester = new BaselineTest(options);
        tester.runBaselineTest().then(() => {
          tester.compareWithBaseline(baselineFile);
          process.exit(0);
        });
        break;
      case "--help":
      case "-h":
        console.log(`
Baseline Test - Memory usage baseline measurement

Usage: node baseline-test.js [options]

Options:
  -o, --output <file>     Output file for baseline (default: ./memory-baseline.json)
  -c, --compare <file>    Compare with existing baseline after test
  -h, --help              Show this help

Examples:
  node baseline-test.js                           # Run baseline test
  node baseline-test.js -o my-baseline.json      # Custom output file
  node baseline-test.js -c previous-baseline.json # Compare with previous
        `);
        process.exit(0);
    }
  }

  const tester = new BaselineTest(options);
  tester
    .runBaselineTest()
    .then(() => {
      console.log("\n✅ Baseline test completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Baseline test failed:", error);
      process.exit(1);
    });
}

module.exports = BaselineTest;
