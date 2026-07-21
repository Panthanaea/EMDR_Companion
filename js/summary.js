const SUMMARY = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function withinLastDays(isoDate, days) {
    const t = new Date(isoDate).getTime();
    return t >= Date.now() - days * DAY_MS;
  }

  function build(data, days = 7) {
    const notes = (data.notes || []).filter((n) => withinLastDays(n.createdAt, days));
    const skillLog = (data.skillUsageLog || []).filter((s) => withinLastDays(s.ts, days));

    // Group by topic: count, average SUD, max SUD
    const byTopic = {};
    notes.forEach((n) => {
      const key = n.topic || "Untitled";
      if (!byTopic[key]) byTopic[key] = { topic: key, count: 0, sudSum: 0, sudMax: 0 };
      byTopic[key].count += 1;
      byTopic[key].sudSum += Number(n.sud || 0);
      byTopic[key].sudMax = Math.max(byTopic[key].sudMax, Number(n.sud || 0));
    });
    const topics = Object.values(byTopic)
      .map((t) => ({ ...t, sudAvg: t.sudSum / t.count }))
      .sort((a, b) => b.sudAvg - a.sudAvg || b.count - a.count);

    // Skill usage frequency
    const skillCounts = {};
    skillLog.forEach((s) => {
      skillCounts[s.skill] = (skillCounts[s.skill] || 0) + 1;
    });
    const skillsRanked = Object.entries(skillCounts)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count);

    // Symptom tag frequency
    const symptomCounts = {};
    notes.forEach((n) => {
      (n.symptoms || []).forEach((s) => {
        symptomCounts[s] = (symptomCounts[s] || 0) + 1;
      });
    });
    const symptomsRanked = Object.entries(symptomCounts)
      .map(([symptom, count]) => ({ symptom, count }))
      .sort((a, b) => b.count - a.count);

    return {
      periodDays: days,
      noteCount: notes.length,
      topics,
      skillsRanked,
      symptomsRanked,
    };
  }

  function toClinicianText(summary, containerName) {
    const lines = [];
    lines.push(`EMDR Companion — Weekly Summary`);
    lines.push(`Container: ${containerName}`);
    lines.push(`Period: last ${summary.periodDays} days | Entries: ${summary.noteCount}`);
    lines.push("");
    lines.push("Topics ranked by average distress (SUD):");
    if (summary.topics.length === 0) lines.push("  (no entries this period)");
    summary.topics.forEach((t) => {
      lines.push(`  - ${t.topic}: avg SUD ${t.sudAvg.toFixed(1)}, peak ${t.sudMax}, ${t.count} entr${t.count === 1 ? "y" : "ies"}`);
    });
    lines.push("");
    lines.push("Coping skills used:");
    if (summary.skillsRanked.length === 0) lines.push("  (none logged this period)");
    summary.skillsRanked.forEach((s) => lines.push(`  - ${s.skill}: ${s.count}x`));
    lines.push("");
    lines.push("Symptoms most present:");
    if (summary.symptomsRanked.length === 0) lines.push("  (none logged this period)");
    summary.symptomsRanked.forEach((s) => lines.push(`  - ${s.symptom}: ${s.count}x`));
    return lines.join("\n");
  }

  return { build, toClinicianText };
})();
