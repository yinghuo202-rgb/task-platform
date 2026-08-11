import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const args = readArgs(process.argv.slice(2));
const fragmentsRoot = requiredDirectory(args.fragments, "--fragments");
const factsRoot = requiredDirectory(args.facts, "--facts");
const outputRoot = resolve(args.out ?? "dist/la-vie-journal-import");
if (existsSync(outputRoot)) throw new Error(`输出目录已经存在，请先更换 --out：${outputRoot}`);

const bodyHeadings = new Set([
  "副本开启", "B1层：环形商业街", "铁门与“投影”", "游戏机制：占领花纹", "玩家对抗", "通往下一层", "真相：放映室",
  "游戏线", "运动线", "学习线", "项目线", "购物线",
]);
const sources = [
  { key: "fragments", root: fragmentsRoot, entryAuthor: "Cristina_zl", commentAuthor: "yinghuo202", tag: "七零八碎", italicComments: false },
  { key: "truefacts", root: factsRoot, entryAuthor: "yinghuo202", commentAuthor: "Cristina_zl", tag: "TrueFactsToday", italicComments: true },
];

mkdirSync(join(outputRoot, "entries"), { recursive: true });
mkdirSync(join(outputRoot, "assets"), { recursive: true });
const assets = new Map();
const grouped = new Map();

for (const source of sources) {
  for (const file of markdownFiles(source.root)) {
    const raw = readFileSync(file, "utf8");
    if (!raw.trim()) continue;
    for (const segment of splitByDate(raw, file)) {
      const extracted = extractEntry(segment.lines, file, source);
      if (!extracted.content && !extracted.comments.length) continue;
      const key = `${source.key}:${segment.date}`;
      const existing = grouped.get(key) ?? { source, date: segment.date, parts: [], comments: [], sourceFiles: [] };
      existing.parts.push({ content: extracted.content, section: sectionName(file) });
      existing.comments.push(...extracted.comments);
      existing.sourceFiles.push(relative(source.root, file));
      grouped.set(key, existing);
    }
  }
}

const entries = [];
for (const group of [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || a.source.key.localeCompare(b.source.key))) {
  const relativeFile = `entries/${group.source.key}/${group.date}.md`;
  mkdirSync(resolve(outputRoot, relativeFile, ".."), { recursive: true });
  const multiple = group.parts.length > 1;
  const content = group.parts.map((part) => {
    if (!multiple) return part.content;
    return `## ${part.section}\n\n${part.content}`;
  }).filter(Boolean).join("\n\n---\n\n").trim();
  writeFileSync(resolve(outputRoot, relativeFile), `${content}\n`, "utf8");
  entries.push({
    sourceId: `${group.source.key}:${group.date}`,
    file: relativeFile,
    title: group.date,
    date: group.date,
    authorUsername: group.source.entryAuthor,
    category: "手帐",
    tags: ["旧手帐", group.source.tag],
    comments: group.comments.map((content) => ({ authorUsername: group.source.commentAuthor, content })),
    sourceFiles: group.sourceFiles,
  });
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  entries,
  assets: [...assets.values()].sort((a, b) => a.storageName.localeCompare(b.storageName)),
};
writeFileSync(join(outputRoot, "journal-import-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const fragmentCount = entries.filter((entry) => entry.sourceId.startsWith("fragments:")).length;
const factsCount = entries.filter((entry) => entry.sourceId.startsWith("truefacts:")).length;
if (fragmentCount !== 123 || factsCount !== 50) {
  throw new Error(`拆分结果异常：七零八碎 ${fragmentCount} 篇，TrueFactsToday ${factsCount} 篇`);
}
const commentCount = entries.reduce((total, entry) => total + entry.comments.length, 0);
writeFileSync(join(outputRoot, "README.txt"), [
  "la vie 手帐迁移包",
  "",
  `手帐：${entries.length} 篇（Cristina_zl ${fragmentCount} 篇，yinghuo202 ${factsCount} 篇）`,
  `评论：${commentCount} 条`,
  `图片：${assets.size} 张`,
  "",
  "将本目录内的全部内容复制到 NAS 的 JOURNAL_IMPORT_DIR，然后由管理员在网页点击“导入旧 Markdown”。",
  "导入前请确认 Cristina_zl 已加入 la vie；不要单独导入 entries 目录里的 Markdown。",
  "重复执行会跳过已经成功迁入的手帐。",
  "",
].join("\n"), "utf8");

console.log(JSON.stringify({ output: outputRoot, entries: entries.length, fragmentCount, factsCount, comments: commentCount, assets: assets.size }, null, 2));

function extractEntry(lines, sourceFile, source) {
  const body = [];
  const comments = [];
  let activeComment = [];
  const flushComment = () => {
    const content = cleanLines(activeComment).join("\n").trim();
    if (content) comments.push(rewriteImages(content, sourceFile));
    activeComment = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const unwrapped = unwrapEmphasis(trimmed);
    const headingText = unwrapped.replace(/^>\s?/, "").trim();
    const wholeBold = /^\*{2,3}[\s\S]+\*{2,3}$/.test(trimmed);
    const wholeItalic = /^\*(?!\*)[\s\S]+\*$/.test(trimmed);
    const isBodyHeading = bodyHeadings.has(headingText);
    const isComment = !isBodyHeading && (/^>\s?/.test(unwrapped) || wholeBold || (source.italicComments && wholeItalic));
    if (isComment) {
      activeComment.push(line);
      continue;
    }
    flushComment();
    if (isBodyHeading) body.push(`## ${headingText}`);
    else body.push(rewriteImages(line, sourceFile));
  }
  flushComment();
  return { content: trimDocument(body).join("\n"), comments };
}

function splitByDate(raw, file) {
  const lines = raw.replace(/\r/g, "").split("\n");
  const markers = [];
  lines.forEach((line, index) => {
    const date = dateFromLine(line);
    if (date) markers.push({ index, date });
  });
  if (!markers.length) {
    const date = dateFromFilename(basename(file));
    if (!date) throw new Error(`无法从文件名识别日期：${file}`);
    return [{ date, lines }];
  }
  return markers.map((marker, index) => {
    const next = markers[index + 1]?.index ?? lines.length;
    const preamble = index === 0 ? lines.slice(0, marker.index) : [];
    return { date: marker.date, lines: [...preamble, ...lines.slice(marker.index + 1, next)] };
  });
}

function dateFromLine(line) {
  const value = unwrapEmphasis(line.trim()).replace(/^#{1,6}\s*/, "").trim();
  const match = value.match(/^(20\d{2})[./-](\d{1,2})[./-](\d{1,2})(?:\s*于.*)?$/);
  return match ? validDate(match[1], match[2], match[3]) : null;
}

function dateFromFilename(name) {
  const match = name.match(/^(20\d{2})[./-]?(\d{1,2})[./-]?(\d{1,2})/);
  return match ? validDate(match[1], match[2], match[3]) : null;
}

function validDate(year, month, day) {
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day) ? iso : null;
}

function rewriteImages(value, sourceFile) {
  return value.replace(/!\[([^\]]*)\]\(([^)#]+)(?:#[^)]*)?\)/g, (_match, alt, rawPath) => {
    const sourcePath = resolve(sourceFile, "..", rawPath);
    if (!existsSync(sourcePath)) throw new Error(`找不到 Markdown 图片：${sourcePath}`);
    const extension = extname(sourcePath).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) throw new Error(`不支持的手帐图片格式：${sourcePath}`);
    const digest = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
    const storageName = `${digest}${extension}`;
    if (!assets.has(storageName)) {
      const relativeFile = `assets/${storageName}`;
      copyFileSync(sourcePath, resolve(outputRoot, relativeFile));
      assets.set(storageName, { file: relativeFile, storageName });
    }
    return `![${alt}](/api/v1/entries/assets/${storageName})`;
  });
}

function cleanLines(lines) {
  return lines.map((line) => unwrapEmphasis(line.trim()).replace(/^>\s?/, "").replace(/\*{2,3}/g, "").trim());
}

function unwrapEmphasis(value) {
  const match = value.match(/^\*{1,3}([\s\S]*?)\*{1,3}$/);
  return match ? match[1].trim() : value;
}

function trimDocument(lines) {
  const output = [...lines];
  while (output.length && (!output[0].trim() || /^---+$/.test(output[0].trim()))) output.shift();
  while (output.length && (!output.at(-1).trim() || /^---+$/.test(output.at(-1).trim()))) output.pop();
  return output.filter((line, index) => line.trim() || output[index - 1]?.trim());
}

function sectionName(file) {
  const name = basename(file, extname(file));
  if (name.includes("梦境")) return "梦境记录";
  if (name.includes("随笔")) return "随笔";
  return "日常记录";
}

function markdownFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((item) => {
    const path = join(root, item.name);
    return item.isDirectory() ? markdownFiles(path) : item.isFile() && item.name.toLowerCase().endsWith(".md") ? [path] : [];
  }).sort();
}

function requiredDirectory(value, flag) {
  if (!value) throw new Error(`缺少 ${flag}`);
  const path = resolve(value);
  if (!existsSync(path)) throw new Error(`${flag} 目录不存在：${path}`);
  return path;
}

function readArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/, "");
    if (!key || !values[index + 1]) throw new Error("参数格式不正确");
    result[key] = values[index + 1];
  }
  return result;
}
