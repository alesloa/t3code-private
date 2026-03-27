import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { basicSetup } from "codemirror";
import { memo, useCallback, useEffect, useRef } from "react";
import { resolveEditorLanguage } from "~/lib/fileEditorUtils";

interface CodeMirrorEditorProps {
  contents: string;
  filePath: string;
  theme: "light" | "dark";
  onChange: (value: string) => void;
  onSave: () => void;
}

const themeCompartment = new Compartment();
const languageCompartment = new Compartment();

function resolveThemeExtension(theme: "light" | "dark"): Extension {
  return theme === "dark" ? githubDark : githubLight;
}

export const CodeMirrorEditor = memo(function CodeMirrorEditor({
  contents,
  filePath,
  theme,
  onChange,
  onSave,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const contentsRef = useRef(contents);
  const filePathRef = useRef(filePath);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // Create editor view on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSaveRef.current();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const value = update.state.doc.toString();
        contentsRef.current = value;
        onChangeRef.current(value);
      }
    });

    const state = EditorState.create({
      doc: contentsRef.current,
      extensions: [
        basicSetup,
        saveKeymap,
        themeCompartment.of(resolveThemeExtension(theme)),
        languageCompartment.of([]),
        updateListener,
        EditorView.theme({
          "&": { height: "100%", fontSize: "12px" },
          ".cm-scroller": { overflow: "auto" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    // Load language async
    void resolveEditorLanguage(filePathRef.current).then((lang) => {
      if (viewRef.current === view) {
        view.dispatch({ effects: languageCompartment.reconfigure(lang) });
      }
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount/unmount — theme and language changes are handled by effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync theme changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(resolveThemeExtension(theme)) });
  }, [theme]);

  // Sync file path changes (language + document content)
  const syncFileContent = useCallback((newContents: string, newFilePath: string) => {
    const view = viewRef.current;
    if (!view) return;

    contentsRef.current = newContents;
    filePathRef.current = newFilePath;

    // Replace document
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContents },
    });

    // Load and set new language
    void resolveEditorLanguage(newFilePath).then((lang) => {
      if (viewRef.current === view) {
        view.dispatch({ effects: languageCompartment.reconfigure(lang) });
      }
    });
  }, []);

  // Track when filePath or contents prop changes from outside
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Only sync if the file changed or external contents differ from editor state
    if (filePath !== filePathRef.current || contents !== contentsRef.current) {
      syncFileContent(contents, filePath);
    }
  }, [contents, filePath, syncFileContent]);

  return <div ref={containerRef} className="size-full min-h-0" />;
});
