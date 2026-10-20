// 情绪词表。分组只是为了界面好看，发给 AI 的只有词本身。
export const EMOTION_GROUPS: { label: string; words: string[] }[] = [
  { label: '开心', words: ['开心', '满足', '兴奋', '感激', '轻松', '自豪'] },
  { label: '平静', words: ['平静', '安心', '专注', '慵懒', '怀念'] },
  { label: '低落', words: ['疲惫', '孤独', '失落', '无聊', '想家'] },
  { label: '紧张', words: ['焦虑', '烦躁', '压力大', '紧张', '迷茫'] },
];

export const MAX_EMOTIONS = 4;

export const STYLES: { key: string; label: string }[] = [
  { key: 'diary', label: '日记' },
  { key: 'prose', label: '散文' },
  { key: 'poem', label: '短诗' },
  { key: 'letter', label: '给未来的自己' },
];
