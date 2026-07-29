import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  useCreateAvatar,
  useGetCurrentUser,
  getListAvatarsQueryKey,
  getGetUserSummaryQueryKey,
  type AvatarInput,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { Button, IconButton, LoadingView, useScreenInsets } from '@/components/ui';

const STEPS = ['Basics', 'Face', 'Core measurements', 'Detailed fit'];

export default function NewAvatarWizard() {
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Always create avatars for the signed-in user — never trust the route param.
  const meQuery = useGetCurrentUser();
  const id = meQuery.data?.id ?? 0;

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [bodyType, setBodyType] = useState<'male' | 'female'>('male');
  const [facePhoto, setFacePhoto] = useState<string | null>(null);
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [chestCm, setChestCm] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [hipCm, setHipCm] = useState('');
  const [inseamCm, setInseamCm] = useState('');
  const [shoulderCm, setShoulderCm] = useState('');
  const [neckCm, setNeckCm] = useState('');
  const [shoeSizeEu, setShoeSizeEu] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createAvatar = useCreateAvatar({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAvatarsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetUserSummaryQueryKey(id) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      },
      onError: () =>
        setSubmitError("Couldn't save the avatar. Check your connection and try again."),
    },
  });

  const toDataUrl = (asset: ImagePicker.ImagePickerAsset): string | null => {
    if (asset.base64) return `data:image/jpeg;base64,${asset.base64}`;
    if (asset.uri.startsWith('data:')) return asset.uri;
    return null;
  };

  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings to capture your face photo, or choose one from your library instead.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync(pickerOptions);
    if (!result.canceled && result.assets[0]) {
      const url = toDataUrl(result.assets[0]);
      if (url) setFacePhoto(url);
    }
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (!result.canceled && result.assets[0]) {
      const url = toDataUrl(result.assets[0]);
      if (url) setFacePhoto(url);
    }
  };

  const num = (s: string): number | undefined => {
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };

  const canContinue =
    step === 0
      ? name.trim().length > 0
      : step === 2
        ? num(heightCm) !== undefined && num(weightKg) !== undefined
        : true;

  const submit = () => {
    const data: AvatarInput = {
      name: name.trim(),
      bodyType,
      heightCm: num(heightCm)!,
      weightKg: num(weightKg)!,
      ...(facePhoto ? { facePhotoUrl: facePhoto } : {}),
      ...(num(chestCm) !== undefined ? { chestCm: num(chestCm) } : {}),
      ...(num(waistCm) !== undefined ? { waistCm: num(waistCm) } : {}),
      ...(num(hipCm) !== undefined ? { hipCm: num(hipCm) } : {}),
      ...(num(inseamCm) !== undefined ? { inseamCm: num(inseamCm) } : {}),
      ...(num(shoulderCm) !== undefined ? { shoulderCm: num(shoulderCm) } : {}),
      ...(num(neckCm) !== undefined ? { neckCm: num(neckCm) } : {}),
      ...(num(shoeSizeEu) !== undefined ? { shoeSizeEu: num(shoeSizeEu) } : {}),
    };
    if (!id) {
      setSubmitError("Couldn't confirm your account. Try again.");
      return;
    }
    setSubmitError(null);
    createAvatar.mutate({ userId: id, data });
  };

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    testID,
  }: {
    label: string;
    value: string;
    onChange: (t: string) => void;
    placeholder: string;
    testID?: string;
  }) => (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.mutedForeground }}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType="decimal-pad"
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.input, fontFamily: fonts.bodyMedium },
        ]}
      />
    </View>
  );

  if (meQuery.isLoading) return <LoadingView />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <IconButton icon="x" onPress={() => router.back()} testID="close-wizard" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>
            Step {step + 1} of {STEPS.length}
          </Text>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>{STEPS[step]}</Text>
        </View>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.primary, width: `${((step + 1) / STEPS.length) * 100}%` },
          ]}
        />
      </View>

      <KeyboardAwareScrollViewCompat
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1 }}
      >
        {step === 0 ? (
          <>
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.mutedForeground }}>
                Avatar name
              </Text>
              <TextInput
                testID="avatar-name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Everyday me"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  { color: colors.foreground, borderColor: colors.input, fontFamily: fonts.bodyMedium },
                ]}
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.mutedForeground }}>
                Body type
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['male', 'female'] as const).map((bt) => (
                  <Pressable
                    key={bt}
                    testID={`body-${bt}`}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setBodyType(bt);
                    }}
                    style={[
                      styles.segment,
                      {
                        backgroundColor: bodyType === bt ? colors.primary : colors.card,
                        borderColor: bodyType === bt ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.bodySemi,
                        fontSize: 14,
                        color: bodyType === bt ? colors.primaryForeground : colors.foreground,
                        textTransform: 'capitalize',
                      }}
                    >
                      {bt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <View style={{ alignItems: 'center', gap: 18 }}>
            {facePhoto ? (
              <Image source={{ uri: facePhoto }} style={styles.facePreview} contentFit="cover" />
            ) : (
              <View
                style={[
                  styles.facePreview,
                  {
                    backgroundColor: colors.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                <Feather name="user" size={54} color={colors.mutedForeground} />
              </View>
            )}
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 14,
                color: colors.mutedForeground,
                textAlign: 'center',
                paddingHorizontal: 20,
              }}
            >
              Capture a well-lit, front-facing photo. It's used on your avatar and saved looks.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {Platform.OS !== 'web' ? (
                <Button testID="take-photo" label="Take photo" icon="camera" onPress={takePhoto} />
              ) : null}
              <Button
                testID="pick-photo"
                label="Library"
                icon="image"
                variant="secondary"
                onPress={pickFromLibrary}
              />
            </View>
            {facePhoto ? (
              <Button
                label="Remove photo"
                variant="ghost"
                icon="trash-2"
                onPress={() => setFacePhoto(null)}
              />
            ) : null}
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Field testID="height" label="Height (cm)" value={heightCm} onChange={setHeightCm} placeholder="178" />
            <Field testID="weight" label="Weight (kg)" value={weightKg} onChange={setWeightKg} placeholder="74" />
          </View>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground }}>
              Optional — better size recommendations with more measurements.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Chest (cm)" value={chestCm} onChange={setChestCm} placeholder="98" />
              <Field label="Waist (cm)" value={waistCm} onChange={setWaistCm} placeholder="84" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Hip (cm)" value={hipCm} onChange={setHipCm} placeholder="99" />
              <Field label="Inseam (cm)" value={inseamCm} onChange={setInseamCm} placeholder="81" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Shoulder (cm)" value={shoulderCm} onChange={setShoulderCm} placeholder="46" />
              <Field label="Neck (cm)" value={neckCm} onChange={setNeckCm} placeholder="39" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field label="Shoe size (EU)" value={shoeSizeEu} onChange={setShoeSizeEu} placeholder="43" />
              <View style={{ flex: 1 }} />
            </View>
            {submitError ? (
              <Text style={{ color: colors.destructive, fontFamily: fonts.bodyMedium, fontSize: 13 }}>
                {submitError}
              </Text>
            ) : null}
          </>
        ) : null}
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {step > 0 ? (
          <Button label="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button
            testID="wizard-next"
            label="Continue"
            icon="arrow-right"
            disabled={!canContinue}
            onPress={() => setStep(step + 1)}
            style={{ flex: 2 }}
          />
        ) : (
          <Button
            testID="wizard-submit"
            label="Create avatar"
            icon="check"
            loading={createAvatar.isPending}
            onPress={submit}
            style={{ flex: 2 }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  stepLabel: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  stepTitle: { fontFamily: fonts.heading, fontSize: 20 },
  progressTrack: { height: 4, marginHorizontal: 20, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  segment: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  facePreview: { width: 180, height: 180, borderRadius: 90 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 8 },
});
