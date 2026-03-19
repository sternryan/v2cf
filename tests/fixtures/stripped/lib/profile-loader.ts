// lib/profile-loader.ts

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type {
  ProfileFile,
  AudienceProfile,
  LoadedProfile,
  ProfileFrontmatter,
} from "./types";

const PROFILE_DIR = path.join(process.cwd(), "content", "profile");

function readProfileFile(filePath: string): ProfileFile {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  return {
    path: filePath,
    frontmatter: data as ProfileFrontmatter,
    content: content.trim(),
  };
}

function readDirectory(dirPath: string): ProfileFile[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readProfileFile(path.join(dirPath, f)));
}

export function loadProfile(audienceName?: string): LoadedProfile {
  const identity = readProfileFile(path.join(PROFILE_DIR, "identity.md"));
  const preferences = readProfileFile(
    path.join(PROFILE_DIR, "preferences.md")
  );
  const personality = readDirectory(path.join(PROFILE_DIR, "personality"));
  const experiences = readDirectory(path.join(PROFILE_DIR, "experiences"));
  const skills = readDirectory(path.join(PROFILE_DIR, "skills"));

  let audience: AudienceProfile | null = null;
  if (audienceName) {
    const audienceDir = path.join(PROFILE_DIR, "audiences");
    const files = readDirectory(audienceDir);
    const match = files.find(
      (f) =>
        f.path.includes(audienceName) ||
        f.frontmatter.name
          ?.toLowerCase()
          .includes(audienceName.toLowerCase())
    );
    if (match) {
      audience = {
        name: (match.frontmatter.name as string) || audienceName,
        values: (match.frontmatter.values as string[]) || [],
        identity_lead: (match.frontmatter.identity_lead as string) || "",
        identity_support:
          (match.frontmatter.identity_support as string) || "",
        emphasis_overrides:
          (match.frontmatter.emphasis_overrides as Record<string, string>) ||
          {},
        content: match.content,
      };
    }
  }

  return { identity, preferences, personality, experiences, skills, audience };
}

export function filterExperiences(profile: LoadedProfile): ProfileFile[] {
  const overrides = profile.audience?.emphasis_overrides || {};

  return profile.experiences
    .filter((exp) => {
      const slug = path.basename(exp.path, ".md");
      const audienceEmphasis = overrides[slug];
      const globalEmphasis = exp.frontmatter.emphasis;

      // Audience override takes precedence
      const emphasis = audienceEmphasis || globalEmphasis;
      return emphasis !== "avoid";
    })
    .sort((a, b) => {
      const weightA = a.frontmatter.narrative_weight || 0;
      const weightB = b.frontmatter.narrative_weight || 0;
      return weightB - weightA;
    });
}
