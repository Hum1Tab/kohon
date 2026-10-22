/**
 * Builds a self-contained review brief from a project snapshot.
 *
 * The brief follows the evidence-first protocol used by the KOHON
 * "根拠監査" lens: every claim must point at a verbatim quote, state why the
 * quote supports it, and name the falsifier. Keeping the brief deterministic
 * makes it safe to diff and to hand to any AI without extra context.
 */

export interface ReviewBriefChapter {
  id: string;
  title: string;
  kind?: "chapter" | "scene";
  text: string;
}

export interface ReviewBriefNote {
  title: string;
  kind?: string;
  text: string;
}

export interface ReviewBriefFinding {
  role: string;
  title: string;
  status: string;
  quote: string;
  chapterTitle?: string;
}

export interface ReviewBriefInput {
  projectTitle: string;
  chapters: readonly ReviewBriefChapter[];
  notes?: readonly ReviewBriefNote[];
  findings?: readonly ReviewBriefFinding[];
  /** ISO timestamp; pass a fixed value in tests. */
  generatedAt?: string;
  /** Upper bound for the manuscript section so the brief stays usable. */
  maxCharacters?: number;
}

export const DEFAULT_REVIEW_BRIEF_MAX_CHARACTERS = 120_000;
const MAX_NOTE_CHARACTERS = 4_000;

const GATES: readonly { id: string; label: string; question: string }[] = [
  { id: "G1", label: "約束と焦点", question: "この章が読者に約束している体験は何か。焦点は一つに定まっているか。" },
  { id: "G2", label: "根拠", question: "解釈の根拠になる本文箇所を逐語で示せるか。根拠のない推測を混ぜていないか。" },
  { id: "G3", label: "論理と因果", question: "出来事の因果、人物の動機、時系列は本文の記述と両立するか。" },
  { id: "G4", label: "反論", question: "最も強い別解釈・反対読みは何か。それを退ける本文の記述はあるか。" },
  { id: "G5", label: "文章と読者", question: "読みにくさ、説明過多、情報の欠落はどこか。" },
  { id: "G6", label: "完全性", question: "未回収の伏線、未説明の設定、宙に浮いた人物はないか。" },
  { id: "G7", label: "価値と主題", question: "作品が置いている価値前提は何か。意図せず傷つける表現はないか。" }
];

function characterCount(text: string): number {
  return [...text].filter((character) => !/\s/u.test(character)).length;
}

function noteForBrief(note: ReviewBriefNote): string {
  const text = note.text.length > MAX_NOTE_CHARACTERS
    ? `${note.text.slice(0, MAX_NOTE_CHARACTERS)}\n…（以下、${note.text.length - MAX_NOTE_CHARACTERS}文字を省略）`
    : note.text;
  return `### ${note.title}${note.kind === undefined ? "" : `（${note.kind}）`}\n\n${text}`;
}

/**
 * Renders the whole brief. Chapter text is copied verbatim so that a reviewer
 * can quote it back; oversized manuscripts are cut explicitly, never silently.
 */
export function buildReviewBrief(input: ReviewBriefInput): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const limit = Math.max(0, Math.trunc(input.maxCharacters ?? DEFAULT_REVIEW_BRIEF_MAX_CHARACTERS));
  const totalCharacters = input.chapters.reduce((sum, chapter) => sum + characterCount(chapter.text), 0);
  const lines: string[] = [
    `# 査読ブリーフ — ${input.projectTitle}`,
    "",
    `生成: ${generatedAt}`,
    `対象: ${input.chapters.length}章 / ${totalCharacters.toLocaleString("ja-JP")}文字`,
    "",
    "## 1. このブリーフの目的",
    "",
    "この文書は、本文を逐語引用のまま固定して査読するための資料です。",
    "要約だけを渡すと、引用の捏造や都合のよい読み替えが起きます。",
    "引用は必ず下の本文からそのまま写し、見つからない場合は「根拠なし」と書いてください。",
    "",
    "## 2. 依頼",
    "",
    "- 指摘は重大度（Critical / Major / Minor / Note）を付けて並べる。",
    "- Critical を平均で薄めない。重大な指摘が一つでもあれば合格にしない。",
    "- 本文を書き換えず、判断材料と引用だけを示す。",
    "- 作者の意図を推測で補わない。書かれていないことは「未確認」と明記する。",
    "",
    "## 3. 判定基準",
    "",
    "| ゲート | 見ること |",
    "| --- | --- |"
  ];
  for (const gate of GATES) lines.push(`| ${gate.id} ${gate.label} | ${gate.question} |`);

  lines.push(
    "",
    "## 4. 指摘の書き方",
    "",
    "各指摘に次の項目を必ず含めてください。",
    "",
    "- 引用: 本文からの逐語引用（改変しない）",
    "- 根拠の強さ: 直接 / 間接 / なし",
    "- Warrant: その引用がなぜ指摘を支えるのか",
    "- 反証条件: どんな本文記述があればこの指摘を取り下げるか",
    "- 修正案: 任意。本文を置き換えず、方向だけを示す",
    "",
    "## 5. 作品の構成",
    ""
  );
  if (input.chapters.length === 0) {
    lines.push("（本文がありません）");
  } else {
    input.chapters.forEach((chapter, index) => {
      const kind = chapter.kind === "scene" ? "場面" : "章";
      lines.push(`${index + 1}. [${kind}] ${chapter.title} — ${characterCount(chapter.text).toLocaleString("ja-JP")}文字`);
    });
  }

  lines.push("", "## 6. 本文", "");
  let used = 0;
  let truncated = false;
  const omitted: string[] = [];
  input.chapters.forEach((chapter, index) => {
    if (truncated || limit - used <= 0) {
      omitted.push(chapter.title);
      return;
    }
    const remaining = limit - used;
    const kind = chapter.kind === "scene" ? "場面" : "章";
    lines.push(`### ${index + 1}. [${kind}] ${chapter.title}`, "");
    if (chapter.text.length <= remaining) {
      lines.push(chapter.text, "");
      used += chapter.text.length;
      return;
    }
    lines.push(
      chapter.text.slice(0, remaining),
      "",
      `…（この章の残り${chapter.text.length - remaining}文字を省略）`,
      ""
    );
    used = limit;
    truncated = true;
  });
  if (omitted.length > 0) {
    lines.push(`> 省略した章: ${omitted.join("、")}`, "> 上限を超えたため、必要な章だけを別途渡してください。", "");
  }

  const notes = input.notes ?? [];
  lines.push("## 7. 参照メモ", "");
  if (notes.length === 0) {
    lines.push("（メモはありません）", "");
  } else {
    for (const note of notes) lines.push(noteForBrief(note), "");
  }

  const findings = (input.findings ?? []).filter((finding) => finding.status === "open");
  lines.push("## 8. 未対応の指摘", "");
  if (findings.length === 0) {
    lines.push("（未対応の指摘はありません）", "");
  } else {
    for (const finding of findings) {
      const where = finding.chapterTitle === undefined ? "" : ` / ${finding.chapterTitle}`;
      lines.push(`- [${finding.role}${where}] ${finding.title}`, `  - 引用: 「${finding.quote}」`);
    }
    lines.push("");
  }

  lines.push(
    "## 9. 出力",
    "",
    "1. ゲート判定の表（G1–G7）",
    "2. 指摘一覧（重大度・引用・Warrant・反証条件）",
    "3. 最も強い反論と、それに対する応答",
    "4. 未確認事項（根拠を確認できなかった点）",
    ""
  );
  return lines.join("\n");
}
