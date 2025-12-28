'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { generateSearchTokens } from '@/lib/crypto/searchTokens';
import { TopicSelector } from '@/components/topics/TopicSelector';

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded text-sm font-medium transition-colors ${
        isActive
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-gray-50">
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="Inline Code"
      >
        <span className="font-mono text-xs">&lt;/&gt;</span>
      </ToolbarButton>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        H3
      </ToolbarButton>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <span className="text-xs">• List</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <span className="text-xs">1. List</span>
      </ToolbarButton>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Quote"
      >
        <span className="text-xs">"</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title="Code Block"
      >
        <span className="font-mono text-xs">{'{}'}</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <span className="text-xs">—</span>
      </ToolbarButton>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <span className="text-xs">↶</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <span className="text-xs">↷</span>
      </ToolbarButton>
    </div>
  );
}

interface Props {
  entryId: string | null;
  date: string;
  onEntrySaved: () => void;
  today: string;
}

interface EntryData {
  encryptedContent: string;
  iv: string;
  topicId: string | null;
}

export function EntryEditor({ entryId, date, onEntrySaved, today }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const { encryptData, decryptData, isKeyReady } = useEncryption();

  // Check if selected date is today (new entries can only be added to current day)
  const isToday = date === today;
  const isNewEntry = !entryId;

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap min-h-[200px] p-4 text-gray-900 focus:outline-none',
      },
    },
  });

  const loadEntry = useCallback(async () => {
    if (!entryId || !isKeyReady || !editor) return;
    setLoading(true);

    try {
      const response = await fetch(`/api/entries/${entryId}`);
      const { entry }: { entry: EntryData } = await response.json();

      const content = await decryptData(entry.encryptedContent, entry.iv);
      editor.commands.setContent(content);
      setSelectedTopicId(entry.topicId);
    } catch (error) {
      console.error('Failed to load entry:', error);
    } finally {
      setLoading(false);
    }
  }, [entryId, isKeyReady, editor, decryptData]);

  useEffect(() => {
    if (entryId && isKeyReady) {
      loadEntry();
    } else if (!entryId && editor) {
      editor.commands.setContent('');
      setSelectedTopicId(null);
    }
  }, [entryId, isKeyReady, loadEntry, editor]);

  const handleSave = async () => {
    if (!editor || !isKeyReady) return;
    setSaving(true);

    try {
      const content = editor.getHTML();
      const { encryptionKey } = useEncryption.getState();

      const { ciphertext, iv } = await encryptData(content);

      const plainText = editor.getText();
      const searchTokens = await generateSearchTokens(plainText, encryptionKey!);

      if (entryId) {
        await fetch(`/api/entries/${entryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedContent: ciphertext,
            iv,
            searchTokens,
            topicId: selectedTopicId,
          }),
        });
      } else {
        // Always save new entries to today (user's timezone), regardless of selected date
        await fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedContent: ciphertext,
            iv,
            searchTokens,
            ...(selectedTopicId && { topicId: selectedTopicId }),
            entryDate: today,
          }),
        });
      }

      onEntrySaved();
    } catch (error) {
      console.error('Failed to save entry:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entryId) return;
    setDeleting(true);

    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShowDeleteConfirm(false);
        onEntrySaved();
      } else {
        console.error('Failed to delete entry');
      }
    } catch (error) {
      console.error('Failed to delete entry:', error);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading entry...</div>;
  }

  if (!isKeyReady) {
    return <div className="p-4 text-gray-500">Waiting for encryption key...</div>;
  }

  return (
    <div className="p-4 h-full flex flex-col bg-white">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">
          {entryId ? 'Edit Entry' : 'New Entry'}
        </h2>
        <div className="flex items-center gap-2">
          {entryId && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md border border-red-200"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Entry?</h3>
            <p className="text-gray-600 mb-4">
              This action cannot be undone. The entry will be permanently deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <TopicSelector
          selectedTopicId={selectedTopicId}
          onSelectTopic={setSelectedTopicId}
        />
      </div>

      <div className="border rounded-md flex-1 overflow-auto bg-white flex flex-col">
        <EditorToolbar editor={editor} />
        <EditorContent editor={editor} className="flex-1" />
      </div>
    </div>
  );
}
