// 某一天的回顾：照片 → 停留点 → 地图 + 时间线 → 选情绪 → AI 生成文字 → 保存
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { presentPermissionsPicker } from 'expo-media-library';
import { clusterIntoStops, type Stop } from '../../lib/cluster';
import { ensurePhotoPermission, loadPhotosForDay, type PhotoPermission } from '../../lib/photos';
import { nameStops } from '../../lib/geocode';
import { getEntry, saveEntry } from '../../lib/db';
import { buildRequest, generateText } from '../../lib/api';
import { hhmm, prettyDate } from '../../lib/date';
import { EMOTION_GROUPS, MAX_EMOTIONS, STYLES } from '../../constants/emotions';
import { useTheme, type Theme } from '../../lib/theme';

type Phase = 'loading' | 'ready' | 'denied' | 'error';

export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const mapRef = useRef<MapView>(null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [permission, setPermission] = useState<PhotoPermission>('all');
  const [stops, setStops] = useState<Stop[]>([]);
  const [sampledFrom, setSampledFrom] = useState(0); // 抽样前的照片总数，没抽样时为 0
  const [emotions, setEmotions] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [style, setStyle] = useState('diary');
  const [text, setText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // 读取已保存的内容 + 当天照片
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase('loading');
      try {
        const saved = await getEntry(date);
        if (saved && !cancelled) {
          setEmotions(saved.emotions);
          setNote(saved.note);
          setStyle(saved.style);
          setText(saved.text);
          setSavedOnce(true);
        }
        const perm = await ensurePhotoPermission();
        if (cancelled) return;
        setPermission(perm);
        if (perm === 'denied') {
          setPhase('denied');
          return;
        }
        const { photos, total, sampled } = await loadPhotosForDay(date);
        const clustered = clusterIntoStops(photos);
        // 先显示没有地名的时间线，地名查完再更新，用户不用干等
        if (!cancelled) {
          setStops(clustered);
          setSampledFrom(sampled ? total : 0);
          setPhase('ready');
        }
        const named = await nameStops(clustered);
        if (!cancelled) setStops(named);
      } catch (e) {
        if (!cancelled) {
          setErrorMsg((e as Error).message);
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey]);

  const located = stops.filter((x) => x.lat != null && x.lon != null) as (Stop & { lat: number; lon: number })[];
  const coords = located.map((x) => ({ latitude: x.lat, longitude: x.lon }));
  const photoCount = stops.reduce((n, x) => n + x.photos.length, 0);

  // 有没保存的修改时，返回（包括 iOS 侧滑返回）先问一下，免得生成的文字白白丢掉
  usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('还没保存', '现在离开的话，这次的修改会丢掉。', [
      { text: '继续编辑', style: 'cancel' },
      {
        text: '不保存',
        style: 'destructive',
        onPress: () => {
          setDirty(false);
          repeat();
        },
      },
      {
        text: '保存',
        onPress: async () => {
          if (await onSave()) repeat();
        },
      },
    ]);
  });

  function toggleEmotion(w: string) {
    setDirty(true);
    setEmotions((cur) => {
      if (cur.includes(w)) return cur.filter((x) => x !== w);
      if (cur.length >= MAX_EMOTIONS) return cur;
      return [...cur, w];
    });
  }

  async function onGenerate() {
    if (emotions.length === 0 && !note.trim()) {
      Alert.alert('先选几个情绪词', '或者写一句话描述今天的感受，AI 才知道往哪个方向写。');
      return;
    }
    setGenerating(true);
    try {
      const out = await generateText(buildRequest(date, stops, emotions, note, style));
      setText(out);
      setDirty(true);
    } catch (e) {
      Alert.alert('生成失败', (e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  /** 保存成功返回 true */
  async function onSave(): Promise<boolean> {
    try {
      await saveEntry({
        date,
        emotions,
        note,
        style,
        text,
        stops: stops.map((x) => ({
          start: x.start,
          end: x.end,
          placeName: x.placeName ?? '',
          lat: x.lat,
          lon: x.lon,
          photoIds: x.photos.map((p) => p.id),
        })),
      });
      setDirty(false);
      setSavedOnce(true);
      return true;
    } catch (e) {
      Alert.alert('保存失败', (e as Error).message);
      return false;
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: prettyDate(date) }} />
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {/* ---------- 照片 / 地点 ---------- */}
        {phase === 'loading' && (
          <View style={s.center}>
            <ActivityIndicator />
            <Text style={s.sub}>正在读取当天的照片…</Text>
          </View>
        )}

        {phase === 'denied' && (
          <View style={s.card}>
            <Text style={s.h2}>需要照片权限</Text>
            <Text style={s.sub}>到「设置 → 隐私与安全性 → 照片」里允许访问后再回来。你也可以不用照片，直接写下面的部分。</Text>
          </View>
        )}

        {phase === 'error' && (
          <View style={s.card}>
            <Text style={s.h2}>读取照片出错</Text>
            <Text style={s.sub}>{errorMsg}</Text>
            <Pressable onPress={() => setReloadKey((k) => k + 1)}>
              <Text style={s.link}>重试</Text>
            </Pressable>
          </View>
        )}

        {phase === 'ready' && (
          <>
            {permission === 'limited' && (
              <Pressable
                style={s.notice}
                onPress={async () => {
                  await presentPermissionsPicker();
                  setReloadKey((k) => k + 1);
                }}
              >
                <Text style={s.sub}>你只允许访问部分照片，可能漏掉一些。点这里选择更多照片。</Text>
              </Pressable>
            )}

            <Text style={s.summary}>
              {photoCount === 0
                ? '这一天没有找到照片。'
                : `${photoCount} 张照片 · ${stops.length} 个停留点${located.length < stops.length ? ` · ${stops.length - located.length} 个没有定位` : ''}`}
            </Text>
            {sampledFrom > 0 && (
              <Text style={s.sub}>
                这一天有 {sampledFrom} 张照片，太多了，所以在一整天里均匀挑了一部分来整理地点。
              </Text>
            )}

            {coords.length > 0 && (
              <MapView
                ref={mapRef}
                style={s.map}
                onMapReady={() =>
                  mapRef.current?.fitToCoordinates(coords, {
                    edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
                    animated: false,
                  })
                }
              >
                {coords.length > 1 && <Polyline coordinates={coords} strokeColor={t.accent} strokeWidth={3} />}
                {located.map((x, i) => (
                  <Marker
                    key={x.id}
                    coordinate={{ latitude: x.lat, longitude: x.lon }}
                    title={`${i + 1}. ${x.placeName ?? ''}`}
                    description={`${hhmm(x.start)} – ${hhmm(x.end)}`}
                    pinColor={t.accent}
                  />
                ))}
              </MapView>
            )}

            {stops.map((x, i) => (
              <View key={x.id} style={s.stop}>
                <View style={s.stopHeader}>
                  <Text style={s.stopIndex}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.stopPlace}>{x.placeName ?? '查询地名中…'}</Text>
                    <Text style={s.sub}>
                      {x.start === x.end ? hhmm(x.start) : `${hhmm(x.start)} – ${hhmm(x.end)}`} · {x.photos.length} 张
                    </Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {x.photos.slice(0, 12).map((p) => (
                    <Image key={p.id} source={{ uri: p.uri }} style={s.thumb} contentFit="cover" recyclingKey={p.id} />
                  ))}
                </ScrollView>
              </View>
            ))}
          </>
        )}

        {/* ---------- 情绪 ---------- */}
        <View style={s.card}>
          <Text style={s.h2}>这一天感觉怎么样？</Text>
          <Text style={s.sub}>最多选 {MAX_EMOTIONS} 个</Text>
          {EMOTION_GROUPS.map((g) => (
            <View key={g.label} style={s.chipRow}>
              {g.words.map((w) => {
                const on = emotions.includes(w);
                return (
                  <Pressable key={w} onPress={() => toggleEmotion(w)} style={[s.chip, on && s.chipOn]}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{w}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <TextInput
            value={note}
            onChangeText={(v) => {
              setNote(v);
              setDirty(true);
            }}
            placeholder="也可以自己写一句（可选）：比如『下午在图书馆终于把作业写完了』"
            placeholderTextColor={t.sub}
            multiline
            maxLength={500}
            style={s.input}
          />

          <Text style={[s.sub, { marginTop: 12 }]}>文字风格</Text>
          <View style={s.chipRow}>
            {STYLES.map((st) => {
              const on = style === st.key;
              return (
                <Pressable
                  key={st.key}
                  onPress={() => {
                    setStyle(st.key);
                    setDirty(true);
                  }}
                  style={[s.chip, on && s.chipOn]}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>{st.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onGenerate} disabled={generating} style={[s.button, generating && { opacity: 0.6 }]}>
            {generating ? (
              <ActivityIndicator color={t.accentText} />
            ) : (
              <Text style={s.buttonText}>{text ? '重新生成' : '生成文字'}</Text>
            )}
          </Pressable>
        </View>

        {/* ---------- 生成的文字（可以直接改） ---------- */}
        {!!text && (
          <View style={s.card}>
            <Text style={s.h2}>今天的文字</Text>
            <Text style={s.sub}>可以直接修改，改成你自己的话</Text>
            <TextInput
              value={text}
              onChangeText={(v) => {
                setText(v);
                setDirty(true);
              }}
              multiline
              style={[s.input, s.output]}
            />
          </View>
        )}

        <Pressable onPress={onSave} style={[s.button, s.saveButton, !dirty && { opacity: 0.5 }]} disabled={!dirty}>
          <Text style={s.buttonText}>{!dirty && savedOnce ? '已保存 ✓' : '保存'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { padding: 16, gap: 14, paddingBottom: 48 },
    center: { alignItems: 'center', gap: 10, paddingVertical: 40 },
    card: { backgroundColor: t.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, padding: 16, gap: 8 },
    notice: { backgroundColor: t.chip, borderRadius: 12, padding: 12 },
    h2: { fontSize: 17, fontWeight: '600', color: t.text },
    sub: { fontSize: 13, color: t.sub, lineHeight: 18 },
    link: { color: t.accent, fontWeight: '600', marginTop: 8 },
    summary: { fontSize: 14, color: t.sub },
    map: { height: 220, borderRadius: 16, overflow: 'hidden' },
    stop: { backgroundColor: t.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, padding: 12, gap: 10 },
    stopHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stopIndex: {
      width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, overflow: 'hidden',
      backgroundColor: t.accent, color: t.accentText, fontWeight: '700', fontSize: 13,
    },
    stopPlace: { fontSize: 15, fontWeight: '600', color: t.text },
    thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: t.chip },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: t.chip },
    chipOn: { backgroundColor: t.accent },
    chipText: { fontSize: 14, color: t.text },
    chipTextOn: { color: t.accentText, fontWeight: '600' },
    input: {
      marginTop: 12, minHeight: 72, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line,
      padding: 12, fontSize: 15, lineHeight: 22, color: t.text, textAlignVertical: 'top',
    },
    output: { minHeight: 160 },
    button: { marginTop: 14, backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    saveButton: { marginTop: 0 },
    buttonText: { color: t.accentText, fontSize: 16, fontWeight: '600' },
  });
}
