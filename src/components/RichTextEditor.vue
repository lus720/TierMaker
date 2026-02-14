<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  readonly?: boolean
  hideToolbar?: boolean
  fontSize?: number
  fillHeight?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editor = useEditor({
  content: props.modelValue || '',
  editable: !props.readonly,
  extensions: [
    StarterKit.configure({
      heading: false, // 不需要标题
      codeBlock: false, // 不需要代码块
    }),
    Link.configure({
      openOnClick: true,
      autolink: true,
    }),
    Underline,
    Placeholder.configure({
      placeholder: props.placeholder || '输入内容...',
    }),
  ],
  onUpdate: ({ editor }) => {
    const html = editor.getHTML()
    // Tiptap 空内容时返回 '<p></p>'，统一为空字符串
    emit('update:modelValue', html === '<p></p>' ? '' : html)
  },
})

// 同步外部 modelValue 变化
watch(() => props.modelValue, (newVal) => {
  if (!editor.value) return
  const currentHTML = editor.value.getHTML()
  const normalizedNew = newVal || ''
  const normalizedCurrent = currentHTML === '<p></p>' ? '' : currentHTML
  if (normalizedNew !== normalizedCurrent) {
    // Use the editor instance method directly instead of commands
    const { from, to } = editor.value.state.selection
    editor.value.chain().setContent(normalizedNew).setTextSelection({ from, to }).run()
  }
})

// 同步 readonly 变化
watch(() => props.readonly, (newVal) => {
  editor.value?.setEditable(!newVal)
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function setLink() {
  if (!editor.value) return
  const previousUrl = editor.value.getAttributes('link').href
  const url = window.prompt('输入链接地址', previousUrl || 'https://')
  if (url === null) return
  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()

}

function focusEditor() {
  if (editor.value && !editor.value.isFocused) {
    editor.value.commands.focus()
  }
}
</script>

<template>
  <div class="rich-text-editor" :class="{ readonly: props.readonly, 'fill-height': props.fillHeight }">
    <div v-if="!props.readonly && !props.hideToolbar && editor" class="toolbar">

      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
        title="加粗"
      >B</button>
      <button
        type="button"
        class="toolbar-btn italic-btn"
        :class="{ active: editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
        title="斜体"
      >I</button>
      <button
        type="button"
        class="toolbar-btn underline-btn"
        :class="{ active: editor.isActive('underline') }"
        @click="editor.chain().focus().toggleUnderline().run()"
        title="下划线"
      >U</button>
      <span class="toolbar-sep"></span>
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor.isActive('bulletList') }"
        @click="editor.chain().focus().toggleBulletList().run()"
        title="无序列表"
      >•</button>
      <button
        type="button"
        class="toolbar-btn"
        :class="{ active: editor.isActive('orderedList') }"
        @click="editor.chain().focus().toggleOrderedList().run()"
        title="有序列表"
      >1.</button>
      <span class="toolbar-sep"></span>
      <button
        type="button"
        class="toolbar-btn link-btn"
        :class="{ active: editor.isActive('link') }"
        @click="setLink"
        title="链接"
      >🔗</button>
    </div>
    <div 
      class="editor-content-wrapper" 
      :style="{ '--editor-font-size': props.fontSize ? `${props.fontSize}px` : '13px' }"
      @click="focusEditor"
    >
      <EditorContent :editor="editor" class="editor-content" />
    </div>
  </div>
</template>

<style scoped>
.rich-text-editor {
  border: 1px solid var(--border-light-color, #ddd);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-color, #fff);
}

.rich-text-editor.readonly {
  border: none;
  background: transparent;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border-light-color, #ddd);
  background: var(--bg-light-color, #f8f8f8);
  flex-wrap: wrap;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 3px;
  color: var(--text-color, #333);
  font-size: 13px;
  font-weight: bold;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: var(--border-light-color, #ddd);
}

.toolbar-btn.active {
  background: var(--border-color, #aaa);
  color: var(--bg-color, #fff);
}

.italic-btn {
  font-style: italic;
}

.underline-btn {
  text-decoration: underline;
}

.link-btn {
  font-size: 14px;
  font-weight: normal;
}

.toolbar-sep {
  width: 1px;
  height: 20px;
  background: var(--border-light-color, #ddd);
  margin: 0 4px;
}

.editor-content {
  min-height: 60px;
  max-height: 300px;
  overflow-y: auto;
}

.editor-content :deep(.tiptap) {
  padding: 8px 10px;
  outline: none;
  font-size: var(--editor-font-size, 13px);
  line-height: 1.5;
  color: var(--text-color, #333);
}

.editor-content :deep(.tiptap p) {
  margin: 0 0 4px 0;
}

.editor-content :deep(.tiptap p:last-child) {
  margin-bottom: 0;
}

.editor-content :deep(.tiptap ul),
.editor-content :deep(.tiptap ol) {
  padding-left: 20px;
  margin: 4px 0;
}

.editor-content :deep(.tiptap a) {
  color: var(--primary-color, #007bff);
  text-decoration: underline;
}

.editor-content :deep(.tiptap .is-empty::before) {
  content: attr(data-placeholder);
  color: var(--border-light-color, #aaa);
  pointer-events: none;
  float: left;
  height: 0;
}

.readonly .editor-content {
  min-height: auto;
  max-height: none;
}

.rich-text-editor.fill-height {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.rich-text-editor.fill-height .editor-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rich-text-editor.fill-height .editor-content {
  flex: 1;
  min-height: 0;
  max-height: none;
  height: 100%;
}

.rich-text-editor.fill-height .editor-content :deep(.tiptap) {
  min-height: 100%;
  box-sizing: border-box;
}
</style>
