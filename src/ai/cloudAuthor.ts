import type { Lesson, Step } from "../../shared/domain";
import { validateLesson } from "../../shared/domain";
import {
  videoMime,
  validateVideoDuration,
  videoTransport,
} from "../../shared/video";
import { uploadAuthoringVideo, deleteAuthoringVideo } from "../firebase/api";
import { firebaseApp } from "../firebase/client";
export async function draftFromVideo(
  file: File,
  title: string,
  consent: boolean,
  onProgress: (message: string) => void = () => {},
): Promise<Lesson> {
  if (!consent)
    throw new Error(
      "Confirm cloud processing before sending the demonstration.",
    );
  const mime = videoMime(file);
  await new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(file),
      video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      try {
        validateVideoDuration(video.duration);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser cannot decode the demonstration."));
    };
    video.src = url;
  });
  const {
    getAI,
    getGenerativeModel,
    GoogleAIBackend,
    AgentPlatformBackend,
    InferenceMode,
  } = await import("firebase/ai");
  const transport = videoTransport(file.size);
  let uploadedPath: string | undefined;
  let media: import("firebase/ai").Part;
  if (transport === "storage") {
    onProgress("Uploading selected video to private Firebase Storage…");
    const uploaded = await uploadAuthoringVideo(file, mime, (p) =>
      onProgress(`Uploading selected video: ${Math.round(p * 100)}%`),
    );
    uploadedPath = uploaded.path;
    media = {
      type: "fileData",
      fileData: { mimeType: mime, fileUri: uploaded.uri },
    };
  } else {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Cannot read video."));
      reader.readAsDataURL(file);
    });
    media = { type: "inlineData", inlineData: { mimeType: mime, data } };
  }
  const prompt = `You draft a harmless tabletop assembly lesson from the selected expert video. Title: ${title}. Do not invent unseen actions or claim strength, tightness or safety. Return only JSON with title, description, variant, minutes and steps. Up to 5 steps total, at most 2 instruction-only steps and at most 3 visual steps. Each step has id (letters/hyphens), title, instruction, mode (instruction or visual), condition (one observable condition), view, correction, reference (empty string). Use English. Mark hidden or ambiguous actions as instruction mode; require human review. The supervisor must review all output.`;
  if (JSON.stringify({ prompt, media }).length > 18 * 1024 * 1024)
    throw new Error("The serialized request exceeds the authoring limit.");
  try {
    onProgress(
      transport === "storage"
        ? "Drafting with Agent Platform Gemini from your private video…"
        : "Drafting with cloud Gemini…",
    );
    const model = getGenerativeModel(
      getAI(firebaseApp, {
        backend:
          transport === "storage"
            ? new AgentPlatformBackend("global")
            : new GoogleAIBackend(),
      }),
      {
        mode: InferenceMode.ONLY_IN_CLOUD,
        inCloudParams: {
          model: "gemini-3.8-flash",
          generationConfig: { responseMimeType: "application/json" },
        },
      },
      { timeout: 240000 },
    );
    const result = await model.generateContent([media, prompt]);
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
  } catch (error) {
    if (transport === "storage")
      throw new Error(
        `Large-video authoring failed. Enable Agent Platform Gemini API (formerly Vertex AI) in Firebase AI Logic for this project, then retry. ${error instanceof Error ? error.message : "Request failed."}`,
      );
    throw error;
  } finally {
    if (uploadedPath) {
      try {
        await deleteAuthoringVideo(uploadedPath);
      } catch {
        /* Daily retention job removes abandoned originals; never resend automatically. */
      }
    }
  }
}
