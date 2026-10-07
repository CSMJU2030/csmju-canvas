import type { QueryClient } from '@tanstack/react-query';
import { api, qs } from './csmju/api';
import { searchHelp, type HelpArticle } from './help-articles';
import type { DesignSummary, TemplateSummary } from './types';

/// สมองของผู้ช่วย CS Canvas — ค้นจากคู่มือ เทมเพลต และงานของผู้ใช้จริงในระบบ
///
/// ไม่ใช้ LLM และไม่ส่งคำถามออกนอกระบบ (การตัดสินใจของ PL) · ใช้ร่วมกันระหว่างปุ่ม ? และหน้า /assistant
export interface AssistantAnswer {
  articles: HelpArticle[];
  templates: TemplateSummary[];
  designs: DesignSummary[];
  failed: boolean;
}

export async function answerQuestion(question: string, queryClient: QueryClient): Promise<AssistantAnswer> {
  const q = question.trim();

  try {
    const [templates, designs] = await Promise.all([
      queryClient.fetchQuery({ queryKey: ['help', 'templates', q], queryFn: () => api.list<TemplateSummary>(`/templates${qs({ q, limit: 4 })}`) }),
      queryClient.fetchQuery({ queryKey: ['help', 'designs', q], queryFn: () => api.list<DesignSummary>(`/designs${qs({ q, limit: 4 })}`) }),
    ]);

    return { articles: searchHelp(q, 3), templates: templates.items, designs: designs.items, failed: false };
  } catch {
    return { articles: searchHelp(q, 3), templates: [], designs: [], failed: true };
  }
}
