import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import styled, { keyframes, css } from 'styled-components';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Icon } from '../../../../design-system/components/core/Icon.jsx';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { useDictation } from '../../hooks/useDictation.js';
import { DrawingNode } from '../tiptap/DrawingNode.js';
import { DrawingCanvas } from '../atoms/DrawingCanvas.js';

const EditorWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;

  .tiptap {
    flex: 1;
    position: relative;
    z-index: 1;
    padding: 16px 72px 32px 0;
    outline: none;
    font-family: var(--sans, 'Lato', sans-serif);
    font-size: 17px;
    line-height: 1.65;
    color: var(--ink, ${({ theme }) => theme.colors.text});
    touch-action: auto;
    user-select: text;
    -webkit-user-select: text;

    p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      color: ${({ theme }) => theme.colors.textMuted};
      pointer-events: none;
      height: 0;
    }

strong { font-weight: 700; }
    em { font-style: italic; }
    s { text-decoration: line-through; }
    ul, ol { padding-left: 1.5em; }
    blockquote {
      border-left: 3px solid ${({ theme }) => theme.colors.border};
      padding-left: 1em;
      color: ${({ theme }) => theme.colors.textSecondary};
    }
    code {
      background: rgba(0,0,0,0.05);
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre {
      background: rgba(0,0,0,0.05);
      padding: 12px;
      border-radius: 6px;
      code { background: none; padding: 0; }
    }
  }
`;

const ToolbarRow = styled.div<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 0 8px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 8px;
  ${({ $collapsed }) => $collapsed && `
    position: absolute;
    top: 5px;
    right: 0;
    z-index: 2;
    padding: 4px 16px;
    border-bottom: none;
    margin-bottom: 0;
  `}
`;

const ToolbarToggle = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: ${({ $open }) => $open ? '10px 4px' : '6px 4px'};
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 18px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.05rem;
  color: ${({ theme }) => theme.colors.textMuted};
  opacity: 0.5;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s, opacity 0.15s, padding 0.15s;
  margin-left: auto;
  &:hover { color: ${({ theme }) => theme.colors.text}; opacity: 0.8; }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
`;

const ToolbarDivider = styled.div`
  width: 1px;
  height: 16px;
  background: ${({ theme }) => theme.colors.border};
  margin: 0 8px;
`;

const ToolbarButton = styled.button<{ $active?: boolean }>`
  padding: 5px 8px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-size: 16px;
  font-weight: ${({ $active }) => $active ? 600 : 400};
  color: ${({ $active, theme }) => $active ? theme.colors.text : theme.colors.textSecondary};
  background: transparent;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  cursor: pointer;
  transition: color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const micPulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

const MicButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  padding: 6px 6px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  margin-left: 6px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  color: ${({ $active, theme }) => $active ? '#e53e3e' : theme.colors.textMuted};
  opacity: ${({ $active }) => $active ? 1 : 0.5};
  transition: color 0.15s, opacity 0.15s;
  ${({ $active }) => $active && css`animation: ${micPulse} 1.5s ease-in-out infinite;`}
  &:hover { opacity: 0.8; }
`;

const InterimText = styled.div`
  padding: 4px 24px 8px;
  font-size: 0.85rem;
  font-style: italic;
  color: ${({ theme }) => theme.colors.textMuted};
  opacity: 0.7;
  pointer-events: none;
`;

const DictationError = styled.div`
  padding: 4px 24px 8px;
  font-size: 0.8rem;
  color: #e53e3e;
`;

function createCharLimitPlugin(getLimit: () => number | undefined) {
  return new Plugin({
    key: new PluginKey('charLimit'),
    filterTransaction(tr, state) {
      const limit = getLimit();
      if (limit === undefined) return true; // no limit
      if (!tr.docChanged) return true;
      const newText = tr.doc.textContent;
      const oldText = state.doc.textContent;
      // Allow deletions and same-length changes
      if (newText.length <= oldText.length) return true;
      // Block if new text exceeds limit
      return newText.length <= limit;
    },
  });
}

export interface DictationControls {
  toggle: () => void;
}

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  charLimit?: number;
  onEnterSave?: () => void;
  toolbarOpen?: boolean;
  onToolbarToggle?: (open: boolean) => void;
  hideToolbarToggle?: boolean;
  dictationControlRef?: React.MutableRefObject<DictationControls | null>;
  onDictationChange?: (isListening: boolean, interimText: string, error: string) => void;
}

export function Editor({ content, onChange, readOnly = false, placeholder = 'Start writing...', charLimit, onEnterSave, toolbarOpen: externalToolbarOpen, onToolbarToggle, hideToolbarToggle, dictationControlRef, onDictationChange }: EditorProps) {
  const [internalToolbarOpen, setInternalToolbarOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const toolbarOpen = externalToolbarOpen ?? internalToolbarOpen;
  const setToolbarOpen = onToolbarToggle ?? setInternalToolbarOpen;

  // Keep a stable ref to the editor for the dictation callback
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  // Last HTML this editor emitted via onChange
  const lastEmittedRef = useRef<string | null>(null);

  const handleFinalResult = useCallback((text: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.chain().focus().insertContent(text + ' ').run();
  }, []);

  const { isSupported: dictationSupported, isListening, interimText, error: dictationError, startListening, stopListening } = useDictation({ onFinalResult: handleFinalResult });

  // Expose dictation toggle to parent via ref
  useEffect(() => {
    if (dictationControlRef) {
      dictationControlRef.current = { toggle: () => isListening ? stopListening() : startListening() };
    }
  }, [dictationControlRef, isListening, startListening, stopListening]);

  // Notify parent of dictation state changes
  useEffect(() => {
    onDictationChange?.(isListening, interimText, dictationError ?? '');
  }, [isListening, interimText, dictationError, onDictationChange]);

  // Store charLimit in a ref-like closure so the plugin always sees the latest value
  const limitRef = useMemo(() => ({ current: charLimit }), []);
  limitRef.current = charLimit;

  const saveRef = useMemo(() => ({ current: onEnterSave }), []);
  saveRef.current = onEnterSave;

  const charLimitExtension = useMemo(() =>
    Extension.create({
      name: 'charLimit',
      addProseMirrorPlugins() {
        return [createCharLimitPlugin(() => limitRef.current)];
      },
    }),
  []);

  const enterSaveExtension = useMemo(() =>
    Extension.create({
      name: 'enterSave',
      addKeyboardShortcuts() {
        return {
          'Mod-s': () => {
            if (saveRef.current) {
              saveRef.current();
              return true;
            }
            return false;
          },
        };
      },
    }),
  []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      charLimitExtension,
      enterSaveExtension,
      DrawingNode,
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  // Keep editorRef current so the dictation callback always has the latest instance
  editorRef.current = editor;

  // Sync content from parent without emitting an update (prevents onChange→re-render loop).
  // Content we just emitted is already in the editor — skip re-serializing it.
  useEffect(() => {
    if (content === lastEmittedRef.current) return;
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  if (!editor) return null;

  const handleDrawingSave = (svg: string) => {
    setDrawingOpen(false);
    editor?.chain().focus().insertContent({
      type: 'drawing',
      attrs: { svgContent: svg },
    }).run();
  };

  return (
    <>
    {drawingOpen && (
      <DrawingCanvas
        onSave={handleDrawingSave}
        onCancel={() => setDrawingOpen(false)}
      />
    )}
    <EditorWrapper>
      {!readOnly && (toolbarOpen || !hideToolbarToggle) && (
        <ToolbarRow $collapsed={!toolbarOpen}>
          {toolbarOpen && (
            <Toolbar>
              <ToolbarButton
                $active={editor.isActive('bold')}
                aria-pressed={editor.isActive('bold')}
                aria-label="Bold"
                onClick={() => editor.chain().focus().toggleBold().run()}
              >B</ToolbarButton>
              <ToolbarButton
                $active={editor.isActive('italic')}
                aria-pressed={editor.isActive('italic')}
                aria-label="Italic"
                onClick={() => editor.chain().focus().toggleItalic().run()}
              ><em>I</em></ToolbarButton>
              <ToolbarButton
                $active={editor.isActive('strike')}
                aria-pressed={editor.isActive('strike')}
                aria-label="Strikethrough"
                onClick={() => editor.chain().focus().toggleStrike().run()}
              ><s>S</s></ToolbarButton>
              <ToolbarButton
                $active={editor.isActive('code')}
                aria-pressed={editor.isActive('code')}
                aria-label="Inline code"
                onClick={() => editor.chain().focus().toggleCode().run()}
              >&lt;/&gt;</ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                $active={editor.isActive('bulletList')}
                aria-pressed={editor.isActive('bulletList')}
                aria-label="Bullet list"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >• List</ToolbarButton>
              <ToolbarButton
                $active={editor.isActive('orderedList')}
                aria-pressed={editor.isActive('orderedList')}
                aria-label="Ordered list"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >1. List</ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                $active={editor.isActive('blockquote')}
                aria-pressed={editor.isActive('blockquote')}
                aria-label="Blockquote"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              >"</ToolbarButton>
              <ToolbarButton
                $active={editor.isActive('codeBlock')}
                aria-pressed={editor.isActive('codeBlock')}
                aria-label="Code block"
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              >{'{}'}</ToolbarButton>
              <ToolbarButton
                aria-label="Horizontal rule"
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
              >—</ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                aria-label="Undo"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
              >↩</ToolbarButton>
              <ToolbarButton
                aria-label="Redo"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
              >↪</ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                aria-label="Insert drawing"
                title="Insert drawing (Apple Pencil)"
                onClick={() => setDrawingOpen(true)}
              ><Icon name="pencil" size={16} strokeWidth={2} /></ToolbarButton>
            </Toolbar>
          )}
          {!hideToolbarToggle && <ToolbarToggle $open={toolbarOpen} onClick={() => setToolbarOpen(!toolbarOpen)} aria-label="Toggle formatting toolbar" aria-expanded={toolbarOpen}>
            <MaterialIcon $size={20}>stylus_fountain_pen</MaterialIcon>
          </ToolbarToggle>}
          {!hideToolbarToggle && dictationSupported && (
            <MicButton
              $active={isListening}
              onClick={isListening ? stopListening : startListening}
              aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
              title={isListening ? 'Stop dictation' : 'Dictate'}
              type="button"
            >
              <Icon name="mic" size={16} strokeWidth={2} />
            </MicButton>
          )}
        </ToolbarRow>
      )}
      <EditorContent editor={editor} />
      {interimText && <InterimText>{interimText}</InterimText>}
      {dictationError && <DictationError>{dictationError}</DictationError>}
    </EditorWrapper>
    </>
  );
}
