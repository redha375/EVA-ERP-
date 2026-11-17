import { Image, ScrollView, Text, TextInput, View, type KeyboardTypeOptions, type ViewStyle } from "react-native";
import { Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";

const logo = require("@/assets/images/ctp-logo-original.png");

export function CtpPage({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30, gap: 16 }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 }}>
      <Image source={logo} style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: "#0B132B" }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800", letterSpacing: 0.4 }}>CTP SMART</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{subtitle ?? "Atelier · pilotage mobile"}</Text>
      </View>
    </View>
  );
}

export function PageHeading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 5 }}>
      {eyebrow ? <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" }}>{eyebrow}</Text> : null}
      <Text style={{ color: colors.foreground, fontSize: 27, lineHeight: 32, fontWeight: "800" }}>{title}</Text>
      {detail ? <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{detail}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const colors = useColors();
  return <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 }, style]}>{children}</View>;
}

export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "800" }}>{title}</Text>
      {detail ? <Text style={{ color: colors.muted, fontSize: 12 }}>{detail}</Text> : null}
    </View>
  );
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "blue" }) {
  const colors = useColors();
  const palette = {
    neutral: [colors.muted, colors.border],
    success: [colors.success, colors.success],
    warning: [colors.warning, colors.warning],
    danger: [colors.error, colors.error],
    blue: [colors.primary, colors.primary],
  } as const;
  const [textColor, borderColor] = palette[tone];
  return <View style={{ alignSelf: "flex-start", borderColor, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: `${borderColor}16` }}><Text style={{ color: textColor, fontSize: 11, fontWeight: "800" }}>{label}</Text></View>;
}

export function PrimaryButton({ label, onPress, disabled, secondary, style }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; style?: ViewStyle }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [{ minHeight: 48, borderRadius: 14, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: secondary ? colors.surface : colors.primary, borderWidth: secondary ? 1 : 0, borderColor: secondary ? colors.border : colors.primary, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 }, style]}>
      <Text style={{ color: secondary ? colors.foreground : "#FFFFFF", fontSize: 14, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

export function SmallButton({ label, onPress, tone = "blue", disabled }: { label: string; onPress: () => void; tone?: "blue" | "neutral" | "danger"; disabled?: boolean }) {
  const colors = useColors();
  const color = tone === "danger" ? colors.error : tone === "neutral" ? colors.muted : colors.primary;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: color, backgroundColor: `${color}12`, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
      <Text style={{ color, fontWeight: "800", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, keyboardType = "default", multiline, editable = true }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: KeyboardTypeOptions; multiline?: boolean; editable?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "—"}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        textAlignVertical={multiline ? "top" : "center"}
        style={{ minHeight: multiline ? 96 : 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, ...(multiline ? { textAlignVertical: "top" as const } : {}) }}
      />
    </View>
  );
}

export function InfoBox({ title, detail, tone = "blue" }: { title: string; detail: string; tone?: "blue" | "warning" | "danger" }) {
  const colors = useColors();
  const color = tone === "danger" ? colors.error : tone === "warning" ? colors.warning : colors.primary;
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: color, backgroundColor: `${color}10`, borderRadius: 12, padding: 12, gap: 4 }}>
      <Text style={{ color, fontSize: 13, fontWeight: "800" }}>{title}</Text>
      <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>{detail}</Text>
    </View>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}
