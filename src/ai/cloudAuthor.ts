import type { Lesson, Step } from "../../shared/domain";
import { validateLesson } from "../../shared/domain";
import { firebaseApp } from "../firebase/client";
export async function draftFromVideo(
  file: File,
  title: string,
  consent: boolean,
): Promise<Lesson> {
  if (!consent)
    throw new Error(
      "Confirm cloud processing before sending the demonstration.",
    );
  if (file.type !== "video/mp4" || file.size > 8 * 1024 * 1024)
    throw new Error("Choose an MP4 under 8 MiB and 90 seconds.");
  await new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(file),
      video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      video.duration <= 90
        ? resolve()
        : reject(new Error("Use a demonstration no longer than 90 seconds."));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser cannot decode the demonstration."));
    };
    video.src = url;
  });
  const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } =
    await import("firebase/ai");
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Cannot read video."));
    r.readAsDataURL(file);
  });
  const prompt = `You draft a harmless tabletop assembly lesson from the selected expert video. Title: ${title}. Do not invent unseen actions or claim strength, tightness or safety. Return only JSON with title, description, variant, minutes and steps. Up to 5 steps total, at most 2 instruction-only steps and at most 3 visual steps. Each step has id (letters/hyphens), title, instruction, mode (instruction or visual), condition (one observable condition), view, correction, reference (empty string). Use English. Mark hidden or ambiguous actions as instruction mode; require human review. The supervisor must review all output.`;
  if (JSON.stringify({ prompt, data }).length > 18 * 1024 * 1024)
    throw new Error("The serialized request exceeds the authoring limit.");
  const model = getGenerativeModel(
    getAI(firebaseApp, { backend: new GoogleAIBackend() }),
    {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: "gemini-3.8-flash",
        generationConfig: { responseMimeType: "application/json" },
      },
    },
    { timeout: 120000 },
  );
  const result = await model.generateContent([
    prompt,
    { type: "inlineData", inlineData: { mimeType: "video/mp4", data } },
  ]);
  const value = JSON.parse(
    result.response
      .text()
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, ""),
  );
  const lesson: Lesson = {
    ...value,
    id: crypto.randomUUID(),
    steps: value.steps?.map((s: Step) => ({ ...s, reference: "" })),
  };
  validateLesson(lesson);
  return lesson;
}
