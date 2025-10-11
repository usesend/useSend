#!/usr/bin/env node

const v8 = require("v8");
const fs = require("fs");
const path = require("path");

class MemoryProfiler {
  constructor(options = {}) {
    this.outputDir = options.outputDir || "./memory-profiles";
    this.snapshots = [];
    this.baselineSnapshot = null;
    this.isProfiling = false;

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Clean up old snapshots when profiler starts
    this.cleanupOldSnapshots();
  }

  takeSnapshot(label = "") {
    const snapshot = v8.getHeapSnapshot();
    const timestamp = Date.now();
    const filename = `heap-snapshot-${timestamp}${label ? "-" + label : ""}.heapsnapshot`;
    const filepath = path.join(this.outputDir, filename);

    // Write snapshot to file
    const writeStream = fs.createWriteStream(filepath);
    snapshot.pipe(writeStream);

    return new Promise((resolve, reject) => {
      writeStream.on("finish", () => {
        const snapshotInfo = {
          filename,
          filepath,
          timestamp,
          label,
          size: fs.statSync(filepath).size,
        };

        this.snapshots.push(snapshotInfo);
        console.log(
          `📸 Heap snapshot saved: ${filename} (${(snapshotInfo.size / 1024 / 1024).toFixed(2)} MB)`,
        );
        resolve(snapshotInfo);
      });

      writeStream.on("error", reject);
    });
  }

  cleanupOldSnapshots() {
    try {
      const files = fs.readdirSync(this.outputDir);
      const snapshotFiles = files.filter(
        (file) =>
          file.endsWith(".heapsnapshot") || file === "analyze-snapshots.cjs",
      );

      if (snapshotFiles.length > 0) {
        console.log(
          `🧹 Cleaning up ${snapshotFiles.length} old snapshot files...`,
        );

        snapshotFiles.forEach((file) => {
          const filePath = path.join(this.outputDir, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`  Deleted: ${file}`);
          } catch (error) {
            console.log(`  Could not delete ${file}: ${error.message}`);
          }
        });

        console.log("✅ Cleanup completed");
      }
    } catch (error) {
      console.log(`⚠️  Could not clean up old snapshots: ${error.message}`);
    }
  }

  async startProfiling() {
    if (this.isProfiling) {
      console.log("Profiling is already in progress");
      return;
    }

    this.isProfiling = true;
    this.snapshots = [];

    console.log("🔍 Starting memory profiling...");

    // Take baseline snapshot
    console.log("📊 Taking baseline snapshot...");
    this.baselineSnapshot = await this.takeSnapshot("baseline");

    // Force GC before starting
    if (global.gc) {
      global.gc();
      console.log("🗑️  Forced garbage collection");
    }
  }

  async stopProfiling() {
    if (!this.isProfiling) {
      console.log("No profiling in progress");
      return;
    }

    console.log("🏁 Stopping memory profiling...");

    // Take final snapshot
    const finalSnapshot = await this.takeSnapshot("final");

    // Force GC and take another snapshot
    if (global.gc) {
      global.gc();
      console.log("🗑️  Final garbage collection");
      const afterGCSnapshot = await this.takeSnapshot("after-gc");
    }

    this.isProfiling = false;

    // Generate comparison report
    this.generateComparisonReport();

    return {
      baseline: this.baselineSnapshot,
      final: finalSnapshot,
      snapshots: this.snapshots,
    };
  }

  generateComparisonReport() {
    if (!this.baselineSnapshot || this.snapshots.length < 2) {
      console.log("Insufficient snapshots for comparison");
      return;
    }

    const baseline = this.baselineSnapshot;
    const final = this.snapshots[this.snapshots.length - 1];

    console.log("\n=== HEAP SNAPSHOT COMPARISON ===");
    console.log(`Baseline: ${baseline.filename}`);
    console.log(`Final: ${final.filename}`);
    console.log(
      `Size change: ${((final.size - baseline.size) / 1024 / 1024).toFixed(2)} MB`,
    );

    // Create analysis script
    this.createAnalysisScript();
  }

  createAnalysisScript() {
    const analysisScript = `
// Heap Snapshot Analysis Script
// Run with: node analyze-snapshots.cjs

const fs = require('fs');
const path = require('path');

const snapshots = ${JSON.stringify(this.snapshots, null, 2)};

function analyzeSnapshot(snapshotPath) {
  // This would typically use Chrome DevTools protocol or heapdump analysis
  // For now, we'll provide basic file info
  const stats = fs.statSync(snapshotPath);
  return {
    size: stats.size,
    sizeMB: (stats.size / 1024 / 1024).toFixed(2),
    modified: stats.mtime
  };
}

console.log('=== HEAP SNAPSHOT ANALYSIS ===');
snapshots.forEach((snapshot, index) => {
  const analysis = analyzeSnapshot(snapshot.filepath);
  console.log(\`\${index + 1}. \${snapshot.filename}\`);
  console.log(\`   Size: \${analysis.sizeMB} MB\`);
  console.log(\`   Label: \${snapshot.label}\`);
  console.log(\`   Timestamp: \${new Date(snapshot.timestamp).toISOString()}\`);
  console.log('');
});

// To analyze heap snapshots in detail:
// 1. Open Chrome DevTools
// 2. Go to Memory tab
// 3. Load snapshot files
// 4. Use Comparison view to see differences
`;

    const scriptPath = path.join(this.outputDir, "analyze-snapshots.cjs");
    fs.writeFileSync(scriptPath, analysisScript);
    console.log(`📝 Analysis script created: ${scriptPath}`);
  }

  async profileDuringOperation(operation, label = "operation") {
    if (!this.isProfiling) {
      await this.startProfiling();
    }

    console.log(`⚡ Profiling during: ${label}`);

    // Take snapshot before operation
    await this.takeSnapshot(`before-${label}`);

    // Execute the operation
    const startTime = Date.now();
    await operation();
    const endTime = Date.now();

    // Take snapshot after operation
    await this.takeSnapshot(`after-${label}`);

    console.log(`✅ Operation completed in ${endTime - startTime}ms`);

    return {
      duration: endTime - startTime,
      label,
    };
  }

  async compareSnapshots(snapshot1Path, snapshot2Path) {
    console.log(`🔍 Comparing snapshots:`);
    console.log(`  Before: ${snapshot1Path}`);
    console.log(`  After: ${snapshot2Path}`);

    // This is a simplified comparison
    // In a real implementation, you'd use heapdump analysis tools
    const stats1 = fs.statSync(snapshot1Path);
    const stats2 = fs.statSync(snapshot2Path);

    const sizeDiff = stats2.size - stats1.size;
    const percentChange = ((sizeDiff / stats1.size) * 100).toFixed(2);

    console.log(`\n=== COMPARISON RESULTS ===`);
    console.log(`Before: ${(stats1.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`After: ${(stats2.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(
      `Difference: ${(sizeDiff / 1024 / 1024).toFixed(2)} MB (${percentChange}%)`,
    );

    if (sizeDiff > 10 * 1024 * 1024) {
      // 10MB increase
      console.log(`⚠️  Significant memory increase detected!`);
    }

    return {
      before: stats1.size,
      after: stats2.size,
      difference: sizeDiff,
      percentChange: parseFloat(percentChange),
    };
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
      case "--output-dir":
      case "-o":
        options.outputDir = args[++i];
        break;
      case "--compare":
      case "-c":
        // Compare two existing snapshots
        if (i + 2 < args.length) {
          const snapshot1 = args[++i];
          const snapshot2 = args[++i];
          const profiler = new MemoryProfiler();
          profiler.compareSnapshots(snapshot1, snapshot2);
          process.exit(0);
        }
        break;
      case "--help":
      case "-h":
        console.log(`
Memory Profiler - Heap snapshot analysis and comparison

Usage: node memory-profiler.cjs [options]

Options:
  -o, --output-dir <dir>  Output directory for snapshots (default: ./memory-profiles)
  -c, --compare <s1> <s2> Compare two existing snapshot files
  -h, --help              Show this help

Features:
  - Automatically cleans up old snapshots when starting
  - Takes baseline, interval, and final snapshots
  - Generates analysis script for detailed inspection
  - Supports Chrome DevTools heap snapshot analysis

Examples:
  node memory-profiler.cjs                    # Start interactive profiling
  node memory-profiler.cjs -o ./snapshots     # Custom output directory
  node memory-profiler.cjs -c snap1.heapsnapshot snap2.heapsnapshot
        `);
        process.exit(0);
    }
  }

  const profiler = new MemoryProfiler(options);

  // Interactive profiling mode
  console.log("🚀 Starting interactive memory profiling...");
  console.log("Press Ctrl+C to stop and generate report\n");

  profiler.startProfiling().then(() => {
    // Set up interval to take snapshots every 10 seconds
    const snapshotInterval = setInterval(async () => {
      if (profiler.isProfiling) {
        await profiler.takeSnapshot(`interval-${Date.now()}`);
      }
    }, 10000);

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n🛑 Stopping profiler...");
      clearInterval(snapshotInterval);
      await profiler.stopProfiling();
      process.exit(0);
    });

    console.log("💡 Taking snapshots every 10 seconds...");
    console.log("💡 Press Ctrl+C to stop and analyze");
  });
}

module.exports = MemoryProfiler;
