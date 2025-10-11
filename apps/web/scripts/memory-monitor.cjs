#!/usr/bin/env node

const v8 = require("v8");
const fs = require("fs");
const path = require("path");

class MemoryMonitor {
  constructor(options = {}) {
    this.interval = options.interval || 1000; // 1 second default
    this.duration = options.duration || 60000; // 1 minute default
    this.outputFile = options.outputFile || null;
    this.logFile = options.logFile || null;
    this.isRunning = false;
    this.startTime = null;
    this.snapshots = [];
    this.gcStats = {
      total: 0,
      duration: 0,
    };

    // Setup GC monitoring if available
    if (global.gc) {
      const originalGC = global.gc;
      global.gc = () => {
        const start = process.hrtime.bigint();
        originalGC();
        const end = process.hrtime.bigint();
        this.gcStats.total++;
        this.gcStats.duration += Number(end - start) / 1000000; // Convert to ms
      };
    }
  }

  getMemorySnapshot() {
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
      gc: { ...this.gcStats },
    };
  }

  formatSnapshot(snapshot) {
    const formatBytes = (bytes) => {
      const units = ["B", "KB", "MB", "GB"];
      let size = bytes;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return `${size.toFixed(2)} ${units[unitIndex]}`;
    };

    return {
      timestamp: new Date(snapshot.timestamp).toISOString(),
      uptime: `${snapshot.uptime.toFixed(2)}s`,
      memory: {
        rss: formatBytes(snapshot.memory.rss),
        heapTotal: formatBytes(snapshot.memory.heapTotal),
        heapUsed: formatBytes(snapshot.memory.heapUsed),
        external: formatBytes(snapshot.memory.external),
        arrayBuffers: formatBytes(snapshot.memory.arrayBuffers),
      },
      heap: {
        used: formatBytes(snapshot.heap.used),
        total: formatBytes(snapshot.heap.total),
        limit: formatBytes(snapshot.heap.limit),
        available: formatBytes(snapshot.heap.available),
        peak: formatBytes(snapshot.heap.peak),
      },
      gc: {
        total: snapshot.gc.total,
        avgDuration:
          snapshot.gc.total > 0
            ? `${(snapshot.gc.duration / snapshot.gc.total).toFixed(2)}ms`
            : "0ms",
        totalDuration: `${snapshot.gc.duration.toFixed(2)}ms`,
      },
    };
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;

    console.log(logMessage);

    if (this.logFile) {
      fs.appendFileSync(this.logFile, logMessage + "\n");
    }
  }

  start(interval = this.interval, duration = this.duration) {
    if (this.isRunning) {
      this.log("Memory monitor is already running");
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.snapshots = [];
    this.gcStats = { total: 0, duration: 0 };

    this.log(
      `Starting memory monitor (interval: ${interval}ms, duration: ${duration}ms)`,
    );

    const monitorInterval = setInterval(() => {
      const snapshot = this.getMemorySnapshot();
      this.snapshots.push(snapshot);

      const formatted = this.formatSnapshot(snapshot);
      this.log(
        `Memory: RSS=${formatted.memory.rss}, Heap=${formatted.memory.heapUsed}/${formatted.memory.heapTotal}, GC=${formatted.gc.total} runs`,
      );

      // Check for memory warnings
      const heapUsagePercent =
        (snapshot.memory.heapUsed / snapshot.memory.heapTotal) * 100;
      if (heapUsagePercent > 90) {
        this.log(`⚠️  HIGH MEMORY USAGE: ${heapUsagePercent.toFixed(1)}%`);
      }

      // Force GC every 10 intervals if available
      if (global.gc && this.snapshots.length % 10 === 0) {
        global.gc();
      }
    }, interval);

    // Stop after duration
    setTimeout(() => {
      clearInterval(monitorInterval);
      this.stop();
    }, duration);
  }

  stop() {
    if (!this.isRunning) {
      this.log("Memory monitor is not running");
      return;
    }

    this.isRunning = false;
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;

    this.log(`Memory monitor stopped after ${totalDuration}ms`);
    this.generateReport();

    if (this.outputFile) {
      this.saveResults();
    }
  }

  generateReport() {
    if (this.snapshots.length === 0) {
      this.log("No snapshots collected");
      return;
    }

    const initial = this.snapshots[0];
    const final = this.snapshots[this.snapshots.length - 1];

    // Calculate statistics
    const heapUsages = this.snapshots.map((s) => s.memory.heapUsed);
    const rssUsages = this.snapshots.map((s) => s.memory.rss);

    const stats = {
      duration: final.timestamp - initial.timestamp,
      snapshots: this.snapshots.length,
      heap: {
        initial: initial.memory.heapUsed,
        final: final.memory.heapUsed,
        peak: Math.max(...heapUsages),
        min: Math.min(...heapUsages),
        avg: heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length,
        growth: final.memory.heapUsed - initial.memory.heapUsed,
      },
      rss: {
        initial: initial.memory.rss,
        final: final.memory.rss,
        peak: Math.max(...rssUsages),
        min: Math.min(...rssUsages),
        avg: rssUsages.reduce((a, b) => a + b, 0) / rssUsages.length,
        growth: final.memory.rss - initial.memory.rss,
      },
      gc: this.gcStats,
    };

    this.log("\n=== MEMORY ANALYSIS REPORT ===");
    this.log(`Duration: ${(stats.duration / 1000).toFixed(2)}s`);
    this.log(`Snapshots: ${stats.snapshots}`);
    this.log(`\nHeap Memory:`);
    this.log(`  Initial: ${(stats.heap.initial / 1024 / 1024).toFixed(2)} MB`);
    this.log(`  Final: ${(stats.heap.final / 1024 / 1024).toFixed(2)} MB`);
    this.log(`  Peak: ${(stats.heap.peak / 1024 / 1024).toFixed(2)} MB`);
    this.log(`  Growth: ${(stats.heap.growth / 1024 / 1024).toFixed(2)} MB`);
    this.log(`\nRSS Memory:`);
    this.log(`  Initial: ${(stats.rss.initial / 1024 / 1024).toFixed(2)} MB`);
    this.log(`  Final: ${(stats.rss.final / 1024 / 1024).toFixed(2)} MB`);
    this.log(`  Peak: ${(stats.rss.peak / 1024 / 1024).toFixed(2)} MB`);
    this.log(`  Growth: ${(stats.rss.growth / 1024 / 1024).toFixed(2)} MB`);
    this.log(`\nGarbage Collection:`);
    this.log(`  Total runs: ${stats.gc.total}`);
    this.log(`  Total duration: ${stats.gc.duration.toFixed(2)}ms`);
    this.log(
      `  Average duration: ${stats.gc.total > 0 ? (stats.gc.duration / stats.gc.total).toFixed(2) : 0}ms`,
    );

    // Memory leak detection
    if (stats.heap.growth > 50 * 1024 * 1024) {
      // 50MB growth
      this.log(
        `⚠️  POTENTIAL MEMORY LEAK: Heap grew by ${(stats.heap.growth / 1024 / 1024).toFixed(2)} MB`,
      );
    }

    if (stats.rss.growth > 100 * 1024 * 1024) {
      // 100MB growth
      this.log(
        `⚠️  HIGH RSS GROWTH: RSS grew by ${(stats.rss.growth / 1024 / 1024).toFixed(2)} MB`,
      );
    }

    return stats;
  }

  saveResults() {
    const results = {
      metadata: {
        startTime: this.startTime,
        endTime: Date.now(),
        interval: this.interval,
        snapshots: this.snapshots.length,
      },
      snapshots: this.snapshots,
      report: this.generateReport(),
    };

    const outputPath = path.resolve(this.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    this.log(`Results saved to: ${outputPath}`);
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
      case "--interval":
      case "-i":
        options.interval = parseInt(args[++i]);
        break;
      case "--duration":
      case "-d":
        options.duration = parseInt(args[++i]);
        break;
      case "--output":
      case "-o":
        options.outputFile = args[++i];
        break;
      case "--log":
      case "-l":
        options.logFile = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
Memory Monitor - Real-time memory usage tracking

Usage: node memory-monitor.cjs [options]

Options:
  -i, --interval <ms>    Monitoring interval (default: 1000ms)
  -d, --duration <ms>    Monitoring duration (default: 60000ms)
  -o, --output <file>    Save results to JSON file
  -l, --log <file>       Save logs to file
  -h, --help             Show this help

Examples:
  node memory-monitor.cjs                           # Default 1 minute monitoring
  node memory-monitor.cjs -i 500 -d 300000         # 500ms interval for 5 minutes
  node memory-monitor.cjs -o memory-results.json   # Save results to file
        `);
        process.exit(0);
    }
  }

  const monitor = new MemoryMonitor(options);
  monitor.start();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down memory monitor...");
    monitor.stop();
    process.exit(0);
  });
}

module.exports = MemoryMonitor;
