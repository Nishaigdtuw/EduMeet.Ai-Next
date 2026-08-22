'use client'

import React, { useState } from "react"
import {
  ChevronDown,
  BookOpen,
  FileText,
  CheckSquare,
  Mic,
  Code,
  MessageSquare,
  Trophy,
  Video,
  Users,
  BarChart2,
  HelpCircle,
  Check
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

export interface WorkspaceOption {
  id: string
  title: string
  description: string
  icon: React.ElementType
  badge?: string
}

export interface WorkspaceGroup {
  label: string
  options: WorkspaceOption[]
}

interface WorkspaceSwitcherProps {
  role: "student" | "teacher"
  activeTab: string
  onSelectTab: (tabId: string) => void
  onOpenModal?: (modalName: string) => void
}

const STUDENT_GROUPS: WorkspaceGroup[] = [
  {
    label: "LEARN",
    options: [
      { id: "overview", title: "Overview", description: "Classroom home & announcements", icon: BookOpen },
      { id: "materials", title: "Materials", description: "Course notes and slides", icon: FileText },
      { id: "notes-ai", title: "Notes AI", description: "Study and ask questions from notes", icon: BookOpen }
    ]
  },
  {
    label: "ASSESS",
    options: [
      { id: "quizzes", title: "Quizzes", description: "Class quizzes and practice tests", icon: CheckSquare },
      { id: "viva", title: "Oral Viva", description: "Spoken conceptual assessment", icon: Mic }
    ]
  },
  {
    label: "BUILD",
    options: [
      { id: "visualizer", title: "Code IDE", description: "Practice and execute code algorithms", icon: Code }
    ]
  },
  {
    label: "COMMUNITY",
    options: [
      { id: "discussion", title: "Discussion", description: "Talk with classmates and doubts", icon: MessageSquare }
    ]
  },
  {
    label: "PROGRESS",
    options: [
      { id: "leaderboard", title: "Leaderboard", description: "Top classroom performance", icon: Trophy }
    ]
  }
]

const TEACHER_GROUPS: WorkspaceGroup[] = [
  {
    label: "TEACH",
    options: [
      { id: "overview", title: "Overview", description: "Classroom dashboard & announcements", icon: BookOpen },
      { id: "materials", title: "Materials", description: "Course slides & documents", icon: FileText },
      { id: "live", title: "Live Classroom", description: "Start interactive live lecture", icon: Video }
    ]
  },
  {
    label: "ASSESS",
    options: [
      { id: "quizzes", title: "Quizzes", description: "Create and view classroom quizzes", icon: CheckSquare },
      { id: "submissions", title: "Submissions", description: "Review student assignment submissions", icon: FileText }
    ]
  },
  {
    label: "CLASS MANAGEMENT",
    options: [
      { id: "students", title: "Roster", description: "View enrolled students and scores", icon: Users }
    ]
  },
  {
    label: "INSIGHTS",
    options: [
      { id: "doubts", title: "Doubt Threads", description: "Answer student question threads", icon: HelpCircle },
      { id: "leaderboard", title: "Mastery League", description: "Classroom performance rankings", icon: Trophy },
      { id: "analytics", title: "Analytics", description: "View teaching analytics", icon: BarChart2 }
    ]
  }
]

export function WorkspaceSwitcher({ role, activeTab, onSelectTab, onOpenModal }: WorkspaceSwitcherProps) {
  const [openPopover, setOpenPopover] = useState(false)
  const [openSheet, setOpenSheet] = useState(false)

  const groups = role === "student" ? STUDENT_GROUPS : TEACHER_GROUPS
  const allOptions = groups.flatMap((g) => g.options)
  const currentOption = allOptions.find((opt) => opt.id === activeTab) || allOptions[0]

  const handleSelect = (optionId: string) => {
    if (optionId === "viva" && onOpenModal) {
      onOpenModal("ai_viva")
      setOpenPopover(false)
      setOpenSheet(false)
      return
    }
    if (optionId === "discussion" && onOpenModal) {
      onOpenModal("peer_study")
      setOpenPopover(false)
      setOpenSheet(false)
      return
    }
    if (optionId === "doubts" && onOpenModal) {
      onOpenModal("doubt_threads")
      setOpenPopover(false)
      setOpenSheet(false)
      return
    }
    if (optionId === "live" && onOpenModal) {
      onOpenModal("live_session")
      setOpenPopover(false)
      setOpenSheet(false)
      return
    }

    onSelectTab(optionId)
    setOpenPopover(false)
    setOpenSheet(false)
  }

  const renderContent = () => (
    <div className="space-y-4 p-1">
      <div className="border-b border-[#E5DCD0] pb-2">
        <h4 className="text-xs font-serif font-black text-[#292724] uppercase tracking-wider">Classroom Workspace</h4>
        <p className="text-[11px] text-[#77716A] font-semibold mt-0.5">Select workspace module to navigate</p>
      </div>

      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <div className="text-[10px] font-black text-[#77716A] tracking-wider uppercase px-2">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.options.map((option) => {
                const IconComponent = option.icon
                const isSelected = activeTab === option.id
                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelect(option.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all duration-150 flex items-start gap-3 cursor-pointer group ${
                      isSelected
                        ? "bg-[#F1E8DD] border border-[#E5DCD0] shadow-2xs"
                        : "hover:bg-[#F1E8DD]/50 border border-transparent"
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${isSelected ? "bg-[#E76F51] text-white" : "bg-[#F1E8DD] text-[#8B7EC8] group-hover:text-[#E76F51]"}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold truncate ${isSelected ? "text-[#E76F51]" : "text-[#292724]"}`}>
                          {option.title}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#E76F51] shrink-0 ml-1" />}
                      </div>
                      <p className="text-[11px] text-[#77716A] font-medium leading-tight mt-0.5 truncate">
                        {option.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      {/* Desktop Floating Popover Switcher */}
      <div className="hidden sm:block">
        <Popover open={openPopover} onOpenChange={setOpenPopover}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="bg-[#FFF9F1] border-[#E5DCD0] text-[#292724] hover:bg-[#F1E8DD] font-serif font-bold text-xs rounded-xl px-4 py-2 flex items-center gap-2 shadow-2xs cursor-pointer transition-all duration-200"
            >
              <currentOption.icon className="w-4 h-4 text-[#E76F51]" />
              <span className="text-sm font-black">{currentOption.title}</span>
              <ChevronDown className="w-4 h-4 text-[#77716A] ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-80 bg-[#FFF9F1] border border-[#E5DCD0] shadow-xl rounded-2xl p-4 z-50">
            {renderContent()}
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile Bottom Sheet Switcher */}
      <div className="sm:hidden">
        <Sheet open={openSheet} onOpenChange={setOpenSheet}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="bg-[#FFF9F1] border-[#E5DCD0] text-[#292724] hover:bg-[#F1E8DD] font-serif font-bold text-xs rounded-xl px-3 py-2 flex items-center gap-2 shadow-2xs cursor-pointer"
            >
              <currentOption.icon className="w-4 h-4 text-[#E76F51]" />
              <span className="text-xs font-black">{currentOption.title}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#77716A] ml-0.5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-[#FFF9F1] border-t border-[#E5DCD0] rounded-t-2xl p-5 max-h-[85vh]">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-left font-serif font-bold text-[#292724] text-base">Classroom Workspace</SheetTitle>
            </SheetHeader>
            {renderContent()}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
