markdown_content = """# Design System Specification: Pulse Operations (Task & Contact Management)

> **Philosophy:** *High-Velocity, Minimalist, Precision.*
> Pulse is built for peak efficiency and execution speed. The interface relies on crisp contrast, tight spatial density, sharp typography, and instantaneous visual feedback. Every pixel and motion token is engineered to minimize cognitive overhead and streamline workflow throughput.

---

## 1. Design Tokens & Foundations

### 1.1 Color Palette
A high-contrast, dark-mode-first or sleek dark-slate palette designed for prolonged focus, reduced eye strain, and high contrast status indicators.

#### Core Brand & Accent Colors
| Token Name | Hex Code | Role / Usage |
| :--- | :--- | :--- |
| `color-primary-electric` | `#3B82F6` | Primary action buttons, active focus states, key operational triggers |
| `color-accent-emerald` | `#10B981` | Success states, task completion, active contact status |
| `color-accent-amber` | `#F59E0B` | Medium priority tags, pending actions, deadline alerts |
| `color-accent-rose` | `#EF4444` | High priority, overdue tasks, destructive actions |

#### Surface & Monochromatic Neutrals
| Token Name | Hex Code | Role / Usage |
| :--- | :--- | :--- |
| `color-bg-base` | `#0F172A` | Primary application background (Deep Slate) |
| `color-bg-surface` | `#1E293B` | Card surfaces, sidebars, modal containers |
| `color-bg-element` | `#334155` | Input backgrounds, hover states, subtle badge containers |
| `color-text-bright` | `#F8FAFC` | Primary headings, critical data values, active labels |
| `color-text-subtle` | `#94A3B8` | Secondary labels, metadata, shortcuts |
| `color-border-crisp` | `#334155` | Panel borders, grid dividers (`1px solid`) |

---

### 1.2 Typography System

**Font Families:**
* **Interface & Data:** `Inter` or `SF Pro Display` (Ultra-legible, crisp variable sans-serif)
* **Code & Hotkeys:** `JetBrains Mono` or `Fira Code` (Monospaced precision for shortcuts, IDs, and metadata)

#### Typography Scale & Specs

```css
:root {
  /* Font Families */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Typography Scale */
  --text-h1: 600 24px/1.2 var(--font-sans);
  --text-h2: 600 18px/1.3 var(--font-sans);
  --text-h3: 600 14px/1.4 var(--font-sans);
  
  --text-body: 400 13px/1.5 var(--font-sans);
  --text-meta: 400 11px/1.4 var(--font-sans);
  --text-shortcut: 500 11px/1.0 var(--font-mono);
}