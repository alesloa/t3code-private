import type { GuideDepth, GuideScope } from "@t3tools/contracts";

// ── Embedded reference specs ────────────────────────────────────────
// These are embedded verbatim from the codebase-to-course reference
// materials so the LLM prompt is fully self-contained.

const DESIGN_SYSTEM_SPEC = `
# Design System Reference

CRITICAL: This course MUST use a DARK THEME. The course will be displayed inside a dark-themed application. Light backgrounds will look broken and jarring.

Complete CSS design tokens for the course. Copy this entire \`:root\` block into the course HTML and adapt the accent color to suit the project's personality.

## Color Palette

\`\`\`css
:root {
  /* --- BACKGROUNDS (DARK THEME) --- */
  --color-bg:             #0C0C0E;       /* near-black, matches app background */
  --color-bg-warm:        #111114;       /* slightly lighter for alternating modules */
  --color-bg-code:        #1A1A2E;       /* deep indigo-charcoal for code blocks */
  --color-text:           #E5E5E5;       /* light neutral for primary text */
  --color-text-secondary: #A0A0A0;       /* medium gray for secondary text */
  --color-text-muted:     #6B6B6B;       /* muted for timestamps, labels */
  --color-border:         rgba(255, 255, 255, 0.08);  /* subtle white border */
  --color-border-light:   rgba(255, 255, 255, 0.04);  /* even subtler border */
  --color-surface:        #161618;       /* card surfaces */
  --color-surface-warm:   #1A1A1E;       /* warm card surface */

  /* --- ACCENT (adapt per project -- pick ONE bold color) ---
     Default: blue. Alternatives: teal (#2DD4BF), violet (#8B5CF6),
     amber (#F59E0B), emerald (#10B981). Avoid warm off-whites. */
  --color-accent:         #6366F1;
  --color-accent-hover:   #818CF8;
  --color-accent-light:   rgba(99, 102, 241, 0.15);
  --color-accent-muted:   rgba(99, 102, 241, 0.6);

  /* --- SEMANTIC --- */
  --color-success:        #10B981;
  --color-success-light:  rgba(16, 185, 129, 0.12);
  --color-error:          #EF4444;
  --color-error-light:    rgba(239, 68, 68, 0.12);
  --color-info:           #3B82F6;
  --color-info-light:     rgba(59, 130, 246, 0.12);

  /* --- ACTOR COLORS (assign to main components) --- */
  --color-actor-1:        #6366F1;       /* indigo */
  --color-actor-2:        #2DD4BF;       /* teal */
  --color-actor-3:        #A78BFA;       /* violet */
  --color-actor-4:        #F59E0B;       /* amber */
  --color-actor-5:        #10B981;       /* emerald */
}

html, body {
  background-color: var(--color-bg);
  color: var(--color-text);
}
\`\`\`

Rules:
- ALWAYS use dark backgrounds. NEVER use light/white backgrounds anywhere.
- Even-numbered modules use --color-bg, odd-numbered use --color-bg-warm (alternating dark backgrounds create subtle visual rhythm)
- Actor colors should be visually distinct from each other and from the accent
- Code blocks always use --color-bg-code with light text
- All shadows should use rgba(0,0,0,0.3) or darker -- never warm-tinted shadows

## Typography

\`\`\`css
:root {
  --font-display:  'Bricolage Grotesque', Georgia, serif;
  --font-body:     'DM Sans', -apple-system, sans-serif;
  --font-mono:     'JetBrains Mono', 'Fira Code', 'Consolas', monospace;

  /* --- TYPE SCALE (1.25 ratio) --- */
  --text-xs:   0.75rem;    /* 12px -- labels, badges */
  --text-sm:   0.875rem;   /* 14px -- secondary text, code */
  --text-base: 1rem;       /* 16px -- body text */
  --text-lg:   1.125rem;   /* 18px -- lead paragraphs */
  --text-xl:   1.25rem;    /* 20px -- screen headings */
  --text-2xl:  1.5rem;     /* 24px -- sub-module titles */
  --text-3xl:  1.875rem;   /* 30px -- module subtitles */
  --text-4xl:  2.25rem;    /* 36px -- module titles */
  --text-5xl:  3rem;       /* 48px -- hero text */
  --text-6xl:  3.75rem;    /* 60px -- module numbers */

  --leading-tight:  1.15;
  --leading-snug:   1.3;
  --leading-normal: 1.6;
  --leading-loose:  1.8;
}
\`\`\`

Google Fonts link (put in <head>):
\`\`\`html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400;1,9..40,500&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
\`\`\`

Rules:
- Module numbers: --text-6xl, font-display, weight 800, --color-accent with 15% opacity
- Module titles: --text-4xl, font-display, weight 700
- Screen headings: --text-xl or --text-2xl, font-display, weight 600
- Body text: --text-base or --text-lg, font-body, --leading-normal
- Code: --text-sm, font-mono
- Labels/badges: --text-xs, font-mono, uppercase, letter-spacing 0.05em

## Spacing & Layout

\`\`\`css
:root {
  --space-1:  0.25rem;   --space-2:  0.5rem;    --space-3:  0.75rem;
  --space-4:  1rem;      --space-5:  1.25rem;    --space-6:  1.5rem;
  --space-8:  2rem;      --space-10: 2.5rem;     --space-12: 3rem;
  --space-16: 4rem;      --space-20: 5rem;       --space-24: 6rem;

  --content-width:     800px;
  --content-width-wide: 1000px;
  --nav-height:        50px;
  --radius-sm:  8px;   --radius-md:  12px;
  --radius-lg:  16px;  --radius-full: 9999px;
}
\`\`\`

Module layout:
\`\`\`css
.module {
  min-height: 100dvh;       /* fallback: 100vh */
  scroll-snap-align: start;
  padding: var(--space-16) var(--space-6);
  padding-top: calc(var(--nav-height) + var(--space-12));
}
.module-content {
  max-width: var(--content-width);
  margin: 0 auto;
}
\`\`\`

## Shadows & Depth

\`\`\`css
:root {
  --shadow-sm:  0 1px 2px rgba(44, 42, 40, 0.05);
  --shadow-md:  0 4px 12px rgba(44, 42, 40, 0.08);
  --shadow-lg:  0 8px 24px rgba(44, 42, 40, 0.1);
  --shadow-xl:  0 16px 48px rgba(44, 42, 40, 0.12);
}
\`\`\`

Use dark RGBA (0, 0, 0) shadows with 0.2-0.4 opacity -- appropriate for dark theme.

## Animations & Transitions

\`\`\`css
:root {
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --duration-fast:   150ms;
  --duration-normal: 300ms;
  --duration-slow:   500ms;
  --stagger-delay:   120ms;
}
\`\`\`

Scroll-triggered reveal pattern:
\`\`\`css
.animate-in {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity var(--duration-slow) var(--ease-out),
              transform var(--duration-slow) var(--ease-out);
}
.animate-in.visible {
  opacity: 1;
  transform: translateY(0);
}
.stagger-children > .animate-in {
  transition-delay: calc(var(--stagger-index, 0) * var(--stagger-delay));
}
\`\`\`

Use IntersectionObserver with rootMargin '0px 0px -10% 0px' and threshold 0.1 to trigger .visible class.

## Navigation & Progress

HTML: nav with .progress-bar, .nav-dots with one button per module.
Nav dot states: default (empty border), current (accent-filled, glow), visited (solid accent fill).
Keyboard: ArrowDown/Right = next module, ArrowUp/Left = prev module.
Progress bar: update width% on scroll using requestAnimationFrame + passive scroll listener.

## Module Structure

\`\`\`html
<section class="module" id="module-N" style="background: var(--color-bg or --color-bg-warm)">
  <div class="module-content">
    <header class="module-header animate-in">
      <span class="module-number">0N</span>
      <h1 class="module-title">Module Title</h1>
      <p class="module-subtitle">One-line description</p>
    </header>
    <div class="module-body">
      <section class="screen animate-in">
        <h2 class="screen-heading">Screen Title</h2>
        <!-- Content, interactive elements, code translations -->
      </section>
    </div>
  </div>
</section>
\`\`\`

## Responsive Breakpoints

Tablet (max-width: 768px): reduce heading sizes, stack translation blocks vertically.
Mobile (max-width: 480px): further reduce sizes, single-column pattern cards, vertical flow arrows.

## Code Block Globals

\`\`\`css
pre, code {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: hidden;
}
\`\`\`

## Syntax Highlighting (Catppuccin-inspired)

\`\`\`css
.code-keyword  { color: #CBA6F7; }  /* purple */
.code-string   { color: #A6E3A1; }  /* green */
.code-function { color: #89B4FA; }  /* blue */
.code-comment  { color: #6C7086; }  /* muted gray */
.code-number   { color: #FAB387; }  /* peach */
.code-property { color: #F9E2AF; }  /* yellow */
.code-operator { color: #94E2D5; }  /* teal */
.code-tag      { color: #F38BA8; }  /* pink */
.code-attr     { color: #F9E2AF; }  /* yellow */
.code-value    { color: #A6E3A1; }  /* green */
\`\`\`

## Scrollbar & Background

Custom scrollbar: 6px width, transparent track, --color-border thumb.
Body background: --color-bg with subtle radial gradient at 20% 50%.
html: scroll-snap-type: y proximity; scroll-behavior: smooth;
`;

const INTERACTIVE_ELEMENTS_SPEC = `
# Interactive Elements Reference

Implementation patterns for every interactive element type used in courses.

## Code <-> English Translation Blocks

The most important teaching element. Real code on the left, plain English on the right, line by line.

HTML: .translation-block with .translation-code and .translation-english children.
CSS: grid with 1fr 1fr columns, code side uses --color-bg-code with light text, English side uses --color-surface-warm with accent left border.
Code must use white-space: pre-wrap; overflow-x: hidden -- NEVER allow horizontal scrollbars.
Stack vertically on mobile (max-width: 768px).
Each English line corresponds to 1-2 code lines. Use conversational language, highlight the "why."

## Multiple-Choice Quizzes

Per-question feedback with correct/incorrect states.
HTML: .quiz-container > .quiz-question-block[data-correct] > .quiz-options > .quiz-option buttons.
JS: selectOption() deselects siblings, checkQuiz() compares selected vs data-correct, shows feedback.
States: .selected (accent border), .correct (success colors), .incorrect (error colors).
Wrong answers: encouraging explanation + highlight correct answer. Right answers: brief reinforcement.

## Drag-and-Drop Matching

.dnd-container with .dnd-chips (draggable) and .dnd-zones (drop targets).
Mouse: HTML5 Drag API (dragstart/dragover/drop).
Touch: Custom touchstart/touchmove/touchend with cloned ghost element at position:fixed.

## Group Chat Animation

iMessage/WeChat-style chat between components. Messages appear one-by-one with typing indicators.
HTML: .chat-window > .chat-messages with .chat-message[data-sender] items (initially hidden).
JS: playChatNext() shows typing dots for 800ms then reveals message with fadeSlideUp animation.
playChatAll() plays all with 1200ms intervals.
Each actor gets a distinct color from --color-actor-N.
CSS typing dots: 3 bouncing dots with staggered animation-delay.

## Message Flow / Data Flow Animation

Step-by-step data flow between actors. User clicks "Next Step" to advance.
HTML: .flow-animation > .flow-actors (actor nodes) + .flow-packet + .flow-step-label + .flow-controls.
JS: flowSteps array with { from, to, label, highlight, packet } objects. flowNext() highlights actors and animates packets.
Active actor gets glow shadow and scale(1.05) transition.

## Interactive Architecture Diagram

Full-system diagram. Click a component to see description.
HTML: .arch-diagram > .arch-zone > .arch-component[data-desc] items.
JS: showArchDesc() reveals description text.

## Layer Toggle Demo

Shows HTML/CSS/JS layers building on each other with tabs.
HTML: .layer-demo > .layer-tabs > .layer-tab buttons, .layer-viewport with 3 layers.

## "Spot the Bug" Challenge

Code with a deliberate bug. User clicks the buggy line.
HTML: .bug-challenge > .bug-code > .bug-line items, one with .bug-target class.
JS: checkBugLine(el, isCorrect) shows feedback.

## Scenario Quiz

Situational questions. Same pattern as Multiple-Choice but with .scenario-block > .scenario-context wrapper.

## Callout Boxes

"Aha!" moments. Max 2 per module.
HTML: .callout.callout-accent > .callout-icon + .callout-content > .callout-title + p.
Variants: callout-accent (vermillion), callout-info (teal), callout-warning (red).

## Pattern/Feature Cards

Grid of concept cards.
CSS: grid with repeat(auto-fit, minmax(220px, 1fr)), hover lifts with translateY(-4px).

## Flow Diagrams

Horizontal flow-steps with arrows. Arrows rotate to vertical on mobile.

## Glossary Tooltips

CRITICAL: Every technical term gets a dashed-underline tooltip.
HTML: <span class="term" data-definition="...">term</span>
CSS: .term has dashed bottom border, cursor: pointer (NOT cursor: help).
JS: Tooltips use position: fixed, appended to document.body (NEVER inside the term element).
Calculate position from getBoundingClientRect(). Flip below if no room above.
Both hover (desktop) and click/tap (mobile) supported.
Close on document click.
Be EXTREMELY aggressive with tooltips -- if there's even a 1% chance a non-technical person doesn't know the word, tooltip it.

## Visual File Tree

.file-tree with .ft-folder and .ft-file items, indented .ft-children.

## Icon-Label Rows

.icon-rows > .icon-row with icon circle and label. Replaces bullet lists.

## Numbered Step Cards

.step-cards > .step-card with numbered circle and body text. Replaces numbered paragraphs.
`;

// ── Shared instructions injected into EVERY prompt ──────────────────

function sharedInstructions(outputPath: string): string {
  return `
CRITICAL RULES (follow these exactly):
1. Write a single self-contained HTML file to: ${outputPath}
2. The HTML must be completely self-contained -- all CSS and JS embedded. Only Google Fonts CDN as external dependency.
3. Use \`white-space: pre-wrap\` on all code blocks -- NEVER allow horizontal scrollbars.
4. Use the exact, unmodified code from the real codebase. Never trim, simplify, or "clean up" code snippets.
5. Do NOT present the curriculum for approval -- just build the course directly.
6. Include syntax highlighting using Catppuccin-inspired colors on dark code backgrounds (#1E1E2E).
7. Use CSS scroll-snap-type: y proximity (NOT mandatory).
8. Use min-height: 100dvh with 100vh fallback for sections.
9. Only animate transform and opacity for GPU performance.
10. Wrap all JS in an IIFE, use passive: true on scroll listeners, throttle with requestAnimationFrame.
11. Include touch support for any drag-and-drop, keyboard navigation (arrow keys), and ARIA attributes.
12. Include a concise, descriptive <title> tag in the HTML <head>. This should be a short name for the guide (e.g., "T3 Code Architecture", "WebSocket System Guide"), NOT the user's prompt text.
`.trim();
}

// ── Quick depth: lightweight prompt template ────────────────────────

function buildQuickPrompt(params: {
  scope: GuideScope;
  projectCwd: string;
  targetPath: string;
  topicQuery: string | null;
  projectName: string;
  outputPath: string;
}): string {
  const { scope, projectCwd, targetPath, topicQuery, projectName, outputPath } = params;

  const scopeInstruction = buildQuickScopeInstruction(
    scope,
    projectCwd,
    targetPath,
    topicQuery,
    projectName,
  );

  return `
You are a technical educator. Generate a clean, attractive single-page HTML guide.

${scopeInstruction}

${sharedInstructions(outputPath)}

DESIGN REQUIREMENTS:
- CRITICAL: Use a DARK color palette: near-black backgrounds (#0C0C0E, #111114), light text (#E5E5E5), indigo accent (#6366F1).
- Typography: 'Bricolage Grotesque' for headings, 'DM Sans' for body, 'JetBrains Mono' for code. Load from Google Fonts.
- Dark code blocks (#1E1E2E) with Catppuccin-inspired syntax highlighting.
- Generous whitespace and dark shadows (rgba(0,0,0,0.3)), matching the dark theme.
- Simple single-page layout -- NO scroll-snap modules, no complex animations.
- Max content width of 800px, centered.

CONTENT ELEMENTS TO INCLUDE:
- Clear section headings with the display font.
- Code <-> English translation blocks: real code on the left, plain English explanation on the right (side-by-side grid, stacks on mobile).
- Glossary tooltips on every technical term: <span class="term" data-definition="...">term</span> with dashed underline, cursor: pointer. Tooltips use position: fixed, appended to document.body via JS, so they are never clipped by overflow: hidden containers.
- Clean card-based layouts for listing concepts or components.

DO NOT INCLUDE:
- Scroll-snap navigation or module-based structure.
- Complex animations, quizzes, drag-and-drop, group chat animations, or data flow animations.
- Progress bars or nav dots.

TARGET AUDIENCE: Non-technical learners ("vibe coders") who build with AI tools but want to understand how the code works. Assume zero CS background. Explain every technical term in plain language. Use metaphors to introduce concepts.

OUTPUT: Write the complete HTML file to ${outputPath}. It must be fully self-contained (CSS + JS inline). Only external dependency: Google Fonts CDN.
`.trim();
}

function buildQuickScopeInstruction(
  scope: GuideScope,
  projectCwd: string,
  targetPath: string,
  topicQuery: string | null,
  projectName: string,
): string {
  switch (scope) {
    case "project":
      return `Analyze the project "${projectName}" at ${projectCwd}. Generate a concise single-page guide covering: what the project does, the main components and their responsibilities, how data flows through the system, and key patterns worth knowing. Keep it focused and practical -- help the reader understand the codebase well enough to steer AI coding tools and debug issues.`;

    case "directory":
      return `Focus your analysis on the directory at ${targetPath} within the project "${projectName}" at ${projectCwd}. Generate a concise single-page guide covering: what this directory/subsystem does, its key files and their roles, how it connects to the rest of the codebase, and important patterns.`;

    case "file":
      return `Explain the file at ${targetPath} within the project "${projectName}" at ${projectCwd}. Generate a concise single-page guide covering: what this file does, its key functions/exports, how it connects to other files in the codebase, and any notable patterns or design decisions.`;

    case "topic":
      return `The user wants to learn about: "${topicQuery}". Explore the codebase "${projectName}" at ${projectCwd} to find all files relevant to this topic. Generate a concise single-page guide explaining how "${topicQuery}" works in this codebase, covering the relevant files, data flows, and patterns.`;
  }
}

// ── Full depth: rich interactive course prompt ──────────────────────

function buildFullPrompt(params: {
  scope: GuideScope;
  projectCwd: string;
  targetPath: string;
  topicQuery: string | null;
  projectName: string;
  outputPath: string;
}): string {
  const { scope, projectCwd, targetPath, topicQuery, projectName, outputPath } = params;

  const scopeBlock = buildFullScopeBlock(scope, projectCwd, targetPath, topicQuery, projectName);

  return `
You are an expert technical educator and web designer. Your task is to transform a codebase into a stunning, interactive single-page HTML course that teaches how the code works to non-technical people.

${scopeBlock}

## Who This Is For

The target learner is a "vibe coder" -- someone who builds software by instructing AI coding tools in natural language, without a traditional CS education. They may have built this project themselves (without looking at the code), or they may have found an interesting open-source project and want to understand how it's built.

Assume zero technical background. Every CS concept -- from variables to APIs to databases -- needs to be explained in plain language. No jargon without definition. The tone should be like a smart friend explaining things, not a professor lecturing.

Their goals are practical:
- Have enough technical knowledge to effectively steer AI coding tools
- Detect when AI is wrong -- spot hallucinations, catch bad patterns
- Intervene when AI gets stuck -- break out of bug loops, debug issues
- Build more advanced software with production-level quality
- Acquire the vocabulary of software -- learn precise technical terms for communicating with AI agents

## The Process

### Phase 1: Codebase Analysis
Before writing HTML, deeply understand the codebase. Read all key files, trace data flows, identify the "cast of characters" (main components/modules), and map how they communicate.

What to extract:
- The main "actors" (components, services, modules) and their responsibilities
- The primary user journey (what happens when someone uses the app end-to-end)
- Key APIs, data flows, and communication patterns
- Clever engineering patterns (caching, lazy loading, error handling)
- The tech stack and why each piece was chosen

Figure out what the app does yourself by reading the README, main entry points, and UI code.

### Phase 2: Curriculum Design
${buildCurriculumInstruction(scope)}

Each module should contain:
- 3-6 screens (sub-sections that flow within the module)
- At least one code-with-English translation
- At least one interactive element (quiz, visualization, or animation)
- One or two "aha!" callout boxes with universal CS insights
- A unique metaphor that grounds the technical concept in everyday life -- NEVER reuse metaphors, NEVER default to "restaurant"

Mandatory interactive elements (EVERY course must include ALL of these):
- Group Chat Animation -- at least one. iMessage/WeChat-style conversations between components.
- Message Flow / Data Flow Animation -- at least one. Step-by-step packet animation between actors.
- Code <-> English Translation Blocks -- at least one per module.
- Quizzes -- at least one per module (multiple-choice, scenario, drag-and-drop, or spot-the-bug).
- Glossary Tooltips -- on every technical term, first use per module.

Do NOT present the curriculum for approval -- just build it directly.

### Phase 3: Build the Course

Build order:
1. Foundation first -- HTML shell with all module sections (empty), complete CSS design system, navigation bar with progress tracking, scroll-snap behavior, keyboard navigation, scroll-triggered animations.
2. One module at a time -- Fill in each module's content, code translations, and interactive elements.
3. Polish pass -- Transitions, mobile responsiveness, visual consistency.

${sharedInstructions(outputPath)}

## Content Philosophy

### Show, Don't Tell -- Aggressively Visual
- Max 2-3 sentences per text block. Convert the fourth sentence into a visual.
- Every screen must be at least 50% visual (diagrams, code blocks, cards, animations).
- Convert text to visuals: lists -> cards with icons, sequences -> flow diagrams, "A talks to B" -> animated data flow, code explanations -> code<->English translation blocks.

### Code <-> English Translations
Every code snippet gets side-by-side plain English. Left: real code with syntax highlighting. Right: line-by-line plain English. Use white-space: pre-wrap so code wraps. Use original code exactly as-is -- never modify.

### One Concept Per Screen
Each screen teaches exactly one idea. If you need more space, add another screen.

### Metaphors First, Then Reality
Introduce every concept with an everyday metaphor, then ground it in code. No recycled metaphors.

### Glossary Tooltips -- No Term Left Behind
Every technical term gets a dashed-underline tooltip on first use per module. Hover/tap to see 1-2 sentence plain-English definition. Be extremely aggressive -- tooltip anything a non-technical person might not know: REPL, JSON, flag, CLI, API, SDK, function, variable, class, module, PR, E2E, all acronyms, software names. Use cursor: pointer, not cursor: help. Tooltips must use position: fixed and be appended to document.body (never inside the term element) to avoid clipping by overflow: hidden containers.

### Quizzes That Test Application, Not Memory
Quiz "what would you do?" scenarios, debugging scenarios, architecture decisions, tracing exercises. Never quiz definitions, file names, or syntax. Wrong answers get encouraging explanations. No scores.

## Design System
${DESIGN_SYSTEM_SPEC}

## Interactive Elements
${INTERACTIVE_ELEMENTS_SPEC}

## Gotchas -- Common Failure Points
- Tooltip clipping: tooltips MUST use position: fixed + document.body append.
- Not enough tooltips: if a term wouldn't appear in everyday non-technical conversation, tooltip it.
- Walls of text: max 2-3 sentences then a visual break. Every screen >= 50% visual.
- Recycled metaphors: every module needs its own unique metaphor.
- Code modifications: never trim or simplify code snippets.
- Quiz memory tests: quiz application, not recall.
- scroll-snap-type mandatory: always use proximity.
- Module quality degradation: build one module at a time.
- Missing interactive elements: every module needs at least one interactive element.
`.trim();
}

function buildCurriculumInstruction(scope: GuideScope): string {
  switch (scope) {
    case "project":
      return `Structure the course as 5-8 modules following this arc:
1. "Here's what this app does -- and what happens when you use it" (start with the product, trace a core user action)
2. Meet the actors (which components exist, their responsibilities)
3. How the pieces talk (data flow, communication patterns)
4. The outside world (APIs, databases, external services)
5. The clever tricks (caching, chunking, error handling patterns)
6. When things break (debugging intuition, common failure modes)
7. The big picture (full architecture, decisions about what to build next)

Not every module is needed -- adapt to the codebase's complexity.`;

    case "directory":
      return `Structure the course as 3-5 modules focusing on this subsystem:
1. What this subsystem does and why it exists (trace a user action through it)
2. Meet the files/components (key actors and their responsibilities)
3. How data flows within this subsystem and to/from the rest of the codebase
4. Key patterns and clever engineering tricks
5. Common issues and debugging tips

Adapt the number of modules to the subsystem's complexity.`;

    case "file":
      return `Structure the course as 2-3 modules:
1. What this file does and why it exists (connect it to a user-facing behavior)
2. How the code works -- walk through key functions/exports with code translations
3. How this file connects to the rest of the codebase -- what calls it, what it calls

Keep it focused but thorough.`;

    case "topic":
      return `Structure the course as 3-5 modules organized around the topic:
1. What this topic/feature is and why it matters (start from the user's perspective)
2. Which files/components are involved (map the relevant code)
3. How it works end-to-end (trace the flow for this specific topic)
4. Key patterns and design decisions
5. Practical tips for working with this part of the codebase

Adapt the number of modules to the topic's breadth.`;
  }
}

function buildFullScopeBlock(
  scope: GuideScope,
  projectCwd: string,
  targetPath: string,
  topicQuery: string | null,
  projectName: string,
): string {
  switch (scope) {
    case "project":
      return `## Your Task
Analyze the FULL codebase of the project "${projectName}" at ${projectCwd}. Generate a 5-8 module interactive HTML course that teaches how the entire project works.

Use sub-agents to analyze different parts of the codebase in parallel for speed.`;

    case "directory":
      return `## Your Task
Focus your analysis on the directory at ${targetPath} within the project "${projectName}" at ${projectCwd}. Generate a 3-5 module interactive HTML course covering this subsystem -- what it does, how it works internally, and how it connects to the rest of the codebase.`;

    case "file":
      return `## Your Task
Explain the file at ${targetPath} within the project "${projectName}" at ${projectCwd}. Generate a 2-3 module interactive HTML course covering what this file does, how it connects to the rest of the codebase, and key patterns used in it.`;

    case "topic":
      return `## Your Task
The user wants to learn about: "${topicQuery}". Explore the codebase "${projectName}" at ${projectCwd} to find all files relevant to this topic, then generate a 3-5 module interactive HTML course explaining how "${topicQuery}" works across the codebase.`;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export function buildGuidePrompt(params: {
  scope: GuideScope;
  depth: GuideDepth;
  projectCwd: string;
  targetPath: string;
  topicQuery: string | null;
  projectName: string;
  outputPath: string;
}): string {
  const { depth, ...rest } = params;

  if (depth === "quick") {
    return buildQuickPrompt(rest);
  }

  return buildFullPrompt(rest);
}
