#!/usr/bin/env sh
set -eu

job_file="${UPDATE_JOB_FILE:-/app/update-state/update-job.json}"
target_version="${TARGET_VERSION:-}"

node - "$job_file" "$target_version" <<'NODE'
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const jobFile = process.argv[2];
const targetVersion = (process.argv[3] || "").trim();

if (targetVersion && !/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(targetVersion)) {
  console.error(`目标版本格式无效：${targetVersion}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(jobFile), { recursive: true });
const job = {
  id: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
  requestedAt: new Date().toISOString(),
  targetVersion: targetVersion || null
};
const tempFile = `${jobFile}.${process.pid}.tmp`;
fs.writeFileSync(tempFile, `${JSON.stringify(job, null, 2)}\n`);
fs.renameSync(tempFile, jobFile);

console.log(`Docker 更新任务已提交${targetVersion ? `：${targetVersion}` : ""}`);
NODE
