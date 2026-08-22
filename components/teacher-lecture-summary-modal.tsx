'use client'

import React, { useState } from "react"
import { Sparkles, Edit3, Send, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { toast } from "sonner"
import { FinalLectureSummary, saveLectureSummary } from "@/lib/data-store"

interface TeacherLectureSummaryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: FinalLectureSummary | null
  errorNotice?: string | null
  onPublished?: () => void
}

export function TeacherLectureSummaryModal({
  open,
  onOpenChange,
  summary: initialSummary,
  errorNotice,
  onPublished
}: TeacherLectureSummaryModalProps) {
  const [summary, setSummary] = useState<FinalLectureSummary | null>(initialSummary)
  const [isEditing, setIsEditing] = useState(false)
  const [editedOverview, setEditedOverview] = useState("")

  React.useEffect(() => {
    setSummary(initialSummary)
    if (initialSummary) {
      setEditedOverview(initialSummary.overview)
    }
  }, [initialSummary])

  if (!summary && !errorNotice) return null

  const handlePublish = () => {
    if (!summary) return
    const publishedSummary: FinalLectureSummary = {
      ...summary,
      overview: editedOverview || summary.overview,
      status: 'Published'
    }

    saveLectureSummary(publishedSummary)
    toast.success(`Published Final Lecture Summary for "${summary.topic}" to enrolled students!`)
    if (onPublished) onPublished()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#FFF9F1] border border-[#E5DCD0] shadow-2xl rounded-2xl p-6 text-[#292724] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-3 border-b border-[#E5DCD0]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#8B7EC8] bg-[#8B7EC8]/10 px-2.5 py-0.5 rounded-full border border-[#8B7EC8]/30 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#E9B949]" /> Final Lecture Summary Generator
            </span>
            <span className="text-xs font-mono font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
              Teacher Review
            </span>
          </div>
          <DialogTitle className="text-xl font-serif font-black text-[#292724] mt-2">
            {summary ? `${summary.className} — ${summary.topic}` : 'Live Class Ended'}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#77716A]">
            Review final lecture notes and summary generated from the spoken lecture transcript.
          </DialogDescription>
        </DialogHeader>

        {errorNotice ? (
          <div className="space-y-4 pt-4">
            <Card className="bg-amber-50 border border-amber-300 rounded-2xl p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-serif font-bold text-amber-900">Insufficient Lecture Speech</h3>
              <p className="text-xs text-amber-800 font-semibold leading-relaxed max-w-md mx-auto">
                {errorNotice}
              </p>
            </Card>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => {
                  onOpenChange(false)
                  if (onPublished) onPublished()
                }}
                className="bg-[#292724] hover:bg-[#1E1C1A] text-white font-bold text-xs py-2 px-6 rounded-xl cursor-pointer"
              >
                Close & Return to Dashboard
              </Button>
            </div>
          </div>
        ) : summary ? (
          <div className="space-y-5 pt-3">
            {/* Lecture Overview */}
            <Card className="bg-white border border-[#E5DCD0] shadow-2xs rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#E76F51] uppercase tracking-wide">Lecture Overview:</h4>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs text-[#8B7EC8] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> {isEditing ? "Done Editing" : "Edit Overview"}
                </button>
              </div>

              {isEditing ? (
                <textarea
                  value={editedOverview}
                  onChange={(e) => setEditedOverview(e.target.value)}
                  rows={3}
                  className="w-full bg-[#FFF9F1] border border-[#E5DCD0] text-xs font-medium text-[#292724] rounded-xl p-2.5 focus:outline-none"
                />
              ) : (
                <p className="text-xs text-[#77716A] font-semibold leading-relaxed">
                  {editedOverview || summary.overview}
                </p>
              )}
            </Card>

            {/* Core Concepts */}
            <Card className="bg-white border border-[#E5DCD0] shadow-2xs rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-[#8B7EC8] uppercase tracking-wide">Core Concepts Covered:</h4>
              <div className="space-y-2">
                {summary.coreConcepts.map((cc, i) => (
                  <div key={i} className="p-3 bg-[#FFF9F1] border border-[#E5DCD0] rounded-xl text-xs space-y-0.5">
                    <p className="font-bold text-[#292724]">{cc.title}</p>
                    <p className="text-[#77716A] font-medium">{cc.explanation}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Definitions */}
            <Card className="bg-white border border-[#E5DCD0] shadow-2xs rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-[#75B798] uppercase tracking-wide">Important Definitions:</h4>
              <div className="space-y-1.5 font-mono text-[11px]">
                {summary.importantDefinitions.map((d, i) => (
                  <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <strong>{d.term}:</strong> {d.definition}
                  </div>
                ))}
              </div>
            </Card>

            {/* Code Logic if present */}
            {summary.codeLogic && (
              <Card className="bg-slate-900 border border-slate-800 text-slate-100 shadow-2xs rounded-2xl p-4 space-y-2 font-mono text-xs">
                <h4 className="font-bold text-amber-400 uppercase tracking-wide font-sans text-xs">Algorithms / Code Logic Covered:</h4>
                <pre className="overflow-x-auto p-3 bg-slate-950 rounded-xl border border-slate-800 leading-relaxed text-[11px]">
                  {summary.codeLogic}
                </pre>
              </Card>
            )}

            {/* Quick Revision & Key Takeaways */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-amber-50 border border-amber-200 shadow-2xs rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Quick Revision:</h4>
                <ul className="list-disc list-inside text-xs text-amber-900 font-semibold space-y-1">
                  {summary.quickRevision.map((qr, i) => (
                    <li key={i}>{qr}</li>
                  ))}
                </ul>
              </Card>

              <Card className="bg-emerald-50 border border-emerald-200 shadow-2xs rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Key Takeaways:</h4>
                <ul className="list-disc list-inside text-xs text-emerald-900 font-semibold space-y-1">
                  {summary.keyTakeaways.map((kt, i) => (
                    <li key={i}>{kt}</li>
                  ))}
                </ul>
              </Card>
            </div>

            <div className="pt-3 border-t border-[#E5DCD0] flex items-center justify-between">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-xs font-bold">
                Discard & Close
              </Button>
              <Button
                onClick={handlePublish}
                className="bg-[#E76F51] hover:bg-[#d55e42] text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" /> Publish to Enrolled Students
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
