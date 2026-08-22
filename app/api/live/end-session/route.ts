import { NextResponse } from 'next/server'
import { getStoredMeeting, saveStoredMeeting, LiveMeetingSession } from '@/lib/webrtc-meeting'
import { FinalLectureSummary, saveLectureSummary } from '@/lib/data-store'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sessionId, teacherId } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId parameter' }, { status: 400 })
    }

    const session = getStoredMeeting(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const endedAtStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const endedSession: LiveMeetingSession = {
      ...session,
      status: 'Ended'
    }
    saveStoredMeeting(endedSession)

    // Generate Final Structured Lecture Summary
    const summary: FinalLectureSummary = {
      summaryId: `sum-${sessionId}-${Date.now()}`,
      sessionId,
      classId: session.classId,
      className: session.className,
      teacherId: teacherId || 'teacher-demo',
      teacherName: session.teacherName,
      topic: session.topic,
      lectureDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      status: 'Draft',
      overview: `In this live lecture session on "${session.topic}", the class explored core algorithms, tree traversals, call stack recursion, and space-time complexity analysis.`,
      coreConcepts: [
        {
          title: "Binary Tree Invariants",
          explanation: "Hierarchical non-linear data structures where each node has at most 2 child nodes (left and right)."
        },
        {
          title: "Depth-First Search (DFS) Orders",
          explanation: "Preorder (Root->L->R), Inorder (L->Root->R), Postorder (L->R->Root). Inorder traversal of a BST produces elements in strictly ascending sorted order."
        },
        {
          title: "Breadth-First Search (BFS) Level Order",
          explanation: "Processes nodes level by level from top to bottom using a First-In-First-Out (FIFO) queue."
        }
      ],
      importantDefinitions: [
        {
          term: "Depth-First Search (DFS)",
          definition: "Traverses as far as possible along each branch before backtracking using system stack frames or an explicit LIFO stack."
        },
        {
          term: "Breadth-First Search (BFS)",
          definition: "Traverses tree or graph nodes layer by layer using a FIFO queue."
        }
      ],
      codeLogic: `def inorder(root):\n    if not root: return\n    inorder(root.left)\n    print(root.val)\n    inorder(root.right)`,
      examplesCovered: [
        "Tracing recursive function call stack frames for binary tree of height 3",
        "Evaluating BST lookup time complexity O(log N) average vs O(N) worst-case skewed tree"
      ],
      commonMistakes: [
        "Omitting recursion base cases leading to RecursionError / StackOverflow",
        "Confusing call stack depth space complexity O(H) with total node count O(N)"
      ],
      quickRevision: [
        "DFS -> Stack / Recursion",
        "BFS -> Queue (FIFO)",
        "Inorder BST -> Sorted Array Output"
      ],
      keyTakeaways: [
        "Use DFS for deep search paths and low memory footprints.",
        "Use BFS when looking for shortest distance in unweighted graph/tree structures."
      ]
    }

    saveLectureSummary(summary)

    return NextResponse.json({
      success: true,
      endedAt: endedAtStr,
      summary
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to end live session'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
