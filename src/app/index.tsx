// 首页：选一天去记录 + 已保存的日记列表
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listEntries, type Entry } from '../lib/db';
import { prettyDate, shiftDate, todayStr } from '../lib/date';
import { useTheme } from '../lib/theme';

export default function Home() {
  const t = useTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pick, setPick] = useState(todayStr());

  // 每次回到首页都刷新列表
  useFocusEffect(
    useCallback(() => {
      listEntries().then(setEntries).catch(console.warn);
    }, []),
  );

  const canGoForward = pick < todayStr();

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.container}
      data={entries}
      keyExtractor={(e) => e.date}
      ListHeaderComponent={
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}>
          <Text style={[styles.label, { color: t.sub }]}>记录哪一天？</Text>
          <View style={styles.pickerRow}>
            <Pressable hitSlop={12} onPress={() => setPick(shiftDate(pick, -1))}>
              <Text style={[styles.arrow, { color: t.text }]}>‹</Text>
            </Pressable>
            <Text style={[styles.pickDate, { color: t.text }]}>{prettyDate(pick)}</Text>
            <Pressable hitSlop={12} disabled={!canGoForward} onPress={() => setPick(shiftDate(pick, 1))}>
              <Text style={[styles.arrow, { color: canGoForward ? t.text : t.line }]}>›</Text>
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [styles.button, { backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push(`/day/${pick}`)}
          >
            <Text style={[styles.buttonText, { color: t.accentText }]}>开始回顾这一天</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        <Text style={[styles.empty, { color: t.sub }]}>还没有保存过的日记。选一天，从照片开始吧。</Text>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/day/${item.date}`)}
          style={[styles.entry, { backgroundColor: t.card, borderColor: t.line }]}
        >
          <Text style={[styles.entryDate, { color: t.text }]}>{prettyDate(item.date)}</Text>
          {item.emotions.length > 0 && (
            <Text style={[styles.entryMeta, { color: t.accent }]}>{item.emotions.join(' · ')}</Text>
          )}
          <Text numberOfLines={2} style={[styles.entryText, { color: t.sub }]}>
            {item.text || item.note || `${item.stops.length} 个地点`}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 20, marginBottom: 8 },
  label: { fontSize: 13, marginBottom: 12 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  arrow: { fontSize: 32, paddingHorizontal: 8, lineHeight: 36 },
  pickDate: { fontSize: 20, fontWeight: '600' },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  entry: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4 },
  entryDate: { fontSize: 16, fontWeight: '600' },
  entryMeta: { fontSize: 13 },
  entryText: { fontSize: 14, lineHeight: 20 },
});
