import pako from "pako";
import { awakenedGemLookup, vaalGemLookup } from "../../../../common/data";
import { BuildData } from "../../../../common/route-processing";

const GEM_ID_REMAP: Record<string, string> = {
  // POB is weird https://github.com/PathOfBuildingCommunity/PathOfBuilding/blob/0d3bdf009c8bc9579eb8cffb5548f03c45e57373/src/Export/Scripts/skills.lua#L504
  "Metadata/Items/Gems/Smite": "Metadata/Items/Gems/SkillGemSmite",
  "Metadata/Items/Gems/ConsecratedPath":
    "Metadata/Items/Gems/SkillGemConsecratedPath",
  "Metadata/Items/Gems/VaalAncestralWarchief":
    "Metadata/Items/Gems/SkillGemVaalAncestralWarchief",
  "Metadata/Items/Gems/HeraldOfAgony":
    "Metadata/Items/Gems/SkillGemHeraldOfAgony",
  "Metadata/Items/Gems/HeraldOfPurity":
    "Metadata/Items/Gems/SkillGemHeraldOfPurity",
  "Metadata/Items/Gems/ScourgeArrow":
    "Metadata/Items/Gems/SkillGemScourgeArrow",
  "Metadata/Items/Gems/RainOfSpores": "Metadata/Items/Gems/SkillGemToxicRain",
  "Metadata/Items/Gems/SummonRelic": "Metadata/Items/Gems/SkillGemSummonRelic",
  // Outdated wiki data?
  "Metadata/Items/Gems/SkillGemNewPhaseRun":
    "Metadata/Items/Gems/SkillGemPhaseRun",
  "Metadata/Items/Gems/SkillGemNewArcticArmour":
    "Metadata/Items/Gems/SkillGemArcticArmour",
};

function MapGemId(gemId: string) {
  const pobRemapId = GEM_ID_REMAP[gemId];
  if (pobRemapId) gemId = pobRemapId;

  const vaalToNormalId = vaalGemLookup[gemId];
  if (vaalToNormalId) gemId = vaalToNormalId;

  const awakenedToNormalId = awakenedGemLookup[gemId];
  if (awakenedToNormalId) gemId = awakenedToNormalId;

  return gemId;
}

function decodePathOfBuildingCode(code: string) {
  const base64 = code.replace(/_/g, "/").replace(/-/g, "+");
  const base64_bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const inflated = pako.inflate(base64_bytes);

  const decoder = new TextDecoder();
  const xmlString = decoder.decode(inflated);

  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "application/xml");

  return xml;
}

const POB_COLOUR_REGEX = /\^(x[a-zA-Z0-9]{6}|[0-9])/;

function processSkills(
  requiredGems: BuildData["requiredGems"],
  parentElement: Element,
  parentTitle: string | undefined
) {
  const skillElements = Array.from(parentElement.getElementsByTagName("Skill"));

  let recentEmptySkillLabel: string | undefined;
  for (const skillElement of skillElements) {
    const skillEnabled = skillElement.attributes.getNamedItem("enabled");
    if (!skillEnabled || skillEnabled.value == "false") continue;

    const skillLabel = skillElement.attributes.getNamedItem("label")?.value;

    const gemElements = Array.from(skillElement.getElementsByTagName("Gem"));
    if (gemElements.length == 0) recentEmptySkillLabel = skillLabel;

    for (const gemElement of gemElements) {
      const attribute = gemElement.attributes.getNamedItem("gemId");
      if (attribute) {
        const gemId = MapGemId(attribute.value);
        if (!requiredGems.some((x) => x.id == gemId)) {
          const note = recentEmptySkillLabel || parentTitle || skillLabel || "";

          requiredGems.push({
            id: gemId,
            uid: Math.random(),
            note: note.replace(POB_COLOUR_REGEX, ""),
          });
        }
      }
    }
  }
}

export function processPob(pobCode: string): BuildData | undefined {
  let doc;
  try {
    doc = decodePathOfBuildingCode(pobCode);
  } catch (e) {
    return undefined;
  }
  const requiredGems: BuildData["requiredGems"] = [];

  const skillSetElements = Array.from(doc.getElementsByTagName("SkillSet"));
  if (skillSetElements.length > 0) {
    for (const skillSetElement of skillSetElements) {
      processSkills(
        requiredGems,
        skillSetElement,
        skillSetElement.attributes.getNamedItem("title")?.value
      );
    }
  } else {
    processSkills(requiredGems, doc.documentElement, undefined);
  }

  const buildElement = Array.from(doc.getElementsByTagName("Build"));
  const characterClass =
    buildElement[0].attributes.getNamedItem("className")?.value;
  const bandit =
    buildElement[0].attributes.getNamedItem("bandit")?.value || "None";

  return {
    characterClass: characterClass!,
    requiredGems: requiredGems,
    bandit: bandit as BuildData["bandit"],
    leagueStart: true,
    library: true,
  };
}
