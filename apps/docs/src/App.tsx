import {
  createLlmSnapshotContext,
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  useInteractionActions,
  useInteractionApi,
  type ActionContext,
  type ActionPayload,
  type InteractionSubmitResult,
} from "@multimodal-ui/react"
import * as React from "react"

type AppScreen = "home" | "todos" | "todoDetail" | "settings"
type TabId = "home" | "todos" | "chatbot" | "settings"
type TodoPriority = "low" | "medium" | "high"
type TodoFilter = "all" | "today" | "active" | "completed"
type ChatStatus = "ready" | "sending" | "error"

type AppRoute = {
  screen: AppScreen
  todoId?: string
}

type Todo = {
  id: string
  title: string
  completed: boolean
  priority: TodoPriority
  due: "今天" | "明天" | "本周"
  description: string
}

type TodoAction =
  | { type: "todo.add"; title: string }
  | { type: "todo.complete"; todoId: string }
  | { type: "todo.uncomplete"; todoId: string }
  | { type: "todo.delete"; todoId: string }
  | { type: "todo.filter"; filter: TodoFilter }
  | { type: "todo.update"; todoId: string; title: string; description: string }
  | { type: "todo.clearCompleted" }

type ChatMessage = {
  id: string
  role: "assistant" | "user"
  content: string
  state?: ChatStatus
}

type SiliconFlowResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: string | { message?: string }
  message?: string
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

const chatModel = "MiniMaxAI/MiniMax-M2.5"

const initialTodos: Todo[] = [
  {
    id: "todo_1",
    title: "买牛奶",
    completed: false,
    priority: "medium",
    due: "今天",
    description: "下班后顺路去超市，优先买低脂牛奶。",
  },
  {
    id: "todo_2",
    title: "写周报",
    completed: false,
    priority: "high",
    due: "今天",
    description: "整理本周发布进展、风险和下周计划。",
  },
  {
    id: "todo_3",
    title: "整理发布清单",
    completed: true,
    priority: "low",
    due: "本周",
    description: "确认文档、回归检查和发布说明都已准备。",
  },
]

const tabItems: Array<{
  id: TabId
  label: string
  target?: AppRoute
  icon: "home" | "list" | "chat" | "settings"
}> = [
  { id: "home", label: "首页", target: { screen: "home" }, icon: "home" },
  { id: "todos", label: "待办", target: { screen: "todos" }, icon: "list" },
  { id: "chatbot", label: "Chatbot", icon: "chat" },
  { id: "settings", label: "设置", target: { screen: "settings" }, icon: "settings" },
]

const filterLabels: Record<TodoFilter, string> = {
  all: "全部",
  today: "今天",
  active: "未完成",
  completed: "已完成",
}

const priorityLabels: Record<TodoPriority, string> = {
  low: "低优先级",
  medium: "中优先级",
  high: "高优先级",
}

export function App() {
  return (
    <MultimodalProvider>
      <AppRuntime />
    </MultimodalProvider>
  )
}

function AppRuntime() {
  const [route, navigate] = useBrowserRoute()
  const [todos, setTodos] = React.useState<Todo[]>(initialTodos)
  const [filter, setFilter] = React.useState<TodoFilter>("all")
  const [apiKey, setApiKey] = useLocalStorage("siliconflow_api_key", "")
  const [isChatOpen, setIsChatOpen] = React.useState(() => window.location.pathname === "/chat")

  React.useEffect(() => {
    const onPopState = () => setIsChatOpen(window.location.pathname === "/chat")
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const executeTodoAction = React.useCallback(
    (action: ActionPayload) => {
      const todoAction = action as TodoAction

      if (todoAction.type === "todo.filter") {
        setFilter(todoAction.filter)
        return
      }

      if (todoAction.type === "todo.add") {
        const title = todoAction.title.trim()
        if (!title) return
        setTodos((current) => [
          {
            id: `todo_${Date.now()}`,
            title,
            completed: false,
            priority: "medium",
            due: "今天",
            description: "",
          },
          ...current,
        ])
        return
      }

      if (todoAction.type === "todo.clearCompleted") {
        setTodos((current) => current.filter((todo) => !todo.completed))
        return
      }

      if (todoAction.type === "todo.update") {
        setTodos((current) =>
          current.map((todo) =>
            todo.id === todoAction.todoId
              ? {
                  ...todo,
                  title: todoAction.title.trim() || todo.title,
                  description: todoAction.description,
                }
              : todo
          )
        )
        return
      }

      if (todoAction.type === "todo.complete") {
        setTodos((current) =>
          current.map((todo) =>
            todo.id === todoAction.todoId ? { ...todo, completed: true } : todo
          )
        )
        return
      }

      if (todoAction.type === "todo.uncomplete") {
        setTodos((current) =>
          current.map((todo) =>
            todo.id === todoAction.todoId ? { ...todo, completed: false } : todo
          )
        )
        return
      }

      if (todoAction.type === "todo.delete") {
        setTodos((current) => current.filter((todo) => todo.id !== todoAction.todoId))
        if (route.screen === "todoDetail" && route.todoId === todoAction.todoId) {
          navigate({ screen: "todos" })
        }
      }
    },
    [navigate, route.screen, route.todoId]
  )

  const todoActionSpecs = React.useMemo(
    () => ({
      "todo.add": {
        attachTo: { id: "todo.composer" },
        executeScope: "page" as const,
        paramsFrom: ({ candidate }: ActionContext) => ({
          title: String(candidate?.params?.title ?? ""),
        }),
      },
      "todo.complete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({ todoId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
      "todo.uncomplete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({ todoId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === true,
      },
      "todo.delete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({ todoId: target.entity?.id }),
        risk: "medium" as const,
      },
      "todo.filter": {
        attachTo: { id: "todo.filters" },
        executeScope: "container" as const,
        paramsFrom: ({ candidate }: ActionContext) => ({
          filter: candidate?.params?.filter ?? "all",
        }),
      },
      "todo.update": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target, candidate }: ActionContext) => ({
          todoId: target.entity?.id,
          title: String(candidate?.params?.title ?? target.label ?? ""),
          description: String(candidate?.params?.description ?? target.state?.description ?? ""),
        }),
      },
      "todo.clearCompleted": {
        executeScope: "page" as const,
        risk: "medium" as const,
      },
    }),
    []
  )

  useInteractionActions({
    namespace: "todo",
    actions: todoActionSpecs,
    execute: executeTodoAction,
  })

  return (
    <MobileApp
      route={route}
      todos={todos}
      filter={filter}
      apiKey={apiKey}
      isChatOpen={isChatOpen}
      onNavigate={navigate}
      onFilterChange={(nextFilter) => executeTodoAction({ type: "todo.filter", filter: nextFilter })}
      onTodoAction={executeTodoAction}
      onApiKeyChange={setApiKey}
      onChatOpenChange={setIsChatOpen}
    />
  )
}

function MobileApp(props: {
  route: AppRoute
  todos: Todo[]
  filter: TodoFilter
  apiKey: string
  isChatOpen: boolean
  onNavigate: (route: AppRoute) => void
  onFilterChange: (filter: TodoFilter) => void
  onTodoAction: (action: TodoAction) => void
  onApiKeyChange: (value: string) => void
  onChatOpenChange: (open: boolean) => void
}) {
  const pageMeta = getPageMeta(props.route, props.todos)
  const pageState = React.useMemo(
    () => createTodoPageState(props.route, props.todos, props.filter),
    [props.filter, props.route, props.todos]
  )

  return (
    <MultimodalPage id={pageMeta.id} title={pageMeta.title} route={pageMeta.path} state={pageState}>
      <main className="mobile-shell">
        <header className="mobile-header">
          <p className="eyebrow">{pageMeta.eyebrow}</p>
          <h1>{pageMeta.title}</h1>
        </header>

        <section className="screen-stack">
          {props.route.screen === "home" ? (
            <HomeScreen
              todos={props.todos}
              onNavigate={props.onNavigate}
              onChatOpen={() => props.onChatOpenChange(true)}
            />
          ) : null}
          {props.route.screen === "todos" ? (
            <TodosScreen
              todos={props.todos}
              filter={props.filter}
              onFilterChange={props.onFilterChange}
              onNavigate={props.onNavigate}
              onTodoAction={props.onTodoAction}
            />
          ) : null}
          {props.route.screen === "todoDetail" ? (
            <TodoDetailScreen
              todo={props.todos.find((todo) => todo.id === props.route.todoId)}
              onNavigate={props.onNavigate}
              onTodoAction={props.onTodoAction}
            />
          ) : null}
          {props.route.screen === "settings" ? (
            <SettingsScreen apiKey={props.apiKey} onApiKeyChange={props.onApiKeyChange} />
          ) : null}
        </section>

        <FloatingChatbot
          apiKey={props.apiKey}
          open={props.isChatOpen}
          onNavigate={props.onNavigate}
          onOpenChange={props.onChatOpenChange}
        />

        <BottomTabs
          route={props.route}
          chatOpen={props.isChatOpen}
          onNavigate={props.onNavigate}
          onChatOpenChange={props.onChatOpenChange}
        />
      </main>
    </MultimodalPage>
  )
}

function HomeScreen(props: {
  todos: Todo[]
  onNavigate: (route: AppRoute) => void
  onChatOpen: () => void
}) {
  const active = props.todos.filter((todo) => !todo.completed)
  const today = props.todos.filter((todo) => todo.due === "今天")
  const nextTodo = active[0]

  return (
    <div className="page-flow">
      <section className="hero-panel">
        <div>
          <p className="section-kicker">今日概览</p>
          <h2>{active.length} 个任务待处理</h2>
        </div>
        <div className="metric-row" aria-label="今日统计">
          <Metric label="今天" value={today.length} />
          <Metric label="未完成" value={active.length} />
          <Metric label="已完成" value={props.todos.length - active.length} />
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>下一项</h2>
          <button
            type="button"
            className="text-button"
            onClick={() => props.onNavigate({ screen: "todos" })}
          >
            查看全部
          </button>
        </div>
        {nextTodo ? (
          <TodoPreviewCard
            todo={nextTodo}
            onOpen={() => props.onNavigate({ screen: "todoDetail", todoId: nextTodo.id })}
          />
        ) : (
          <div className="empty-state">
            <strong>没有待处理事项</strong>
            <span>所有事项都已经完成。</span>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Assistant</h2>
          <button type="button" className="text-button" onClick={props.onChatOpen}>
            打开
          </button>
        </div>
        <p className="muted-copy">可以语音输入，也可以用文字拆解任务。</p>
      </section>
    </div>
  )
}

function TodosScreen(props: {
  todos: Todo[]
  filter: TodoFilter
  onFilterChange: (filter: TodoFilter) => void
  onNavigate: (route: AppRoute) => void
  onTodoAction: (action: TodoAction) => void
}) {
  const [draft, setDraft] = React.useState("")
  const visibleTodos = getVisibleTodos(props.todos, props.filter)

  return (
    <div className="page-flow">
      <MultimodalGroup id="todo.composer" role="composer" label="新增待办">
        <form
          className="composer-panel"
          onSubmit={(event) => {
            event.preventDefault()
            props.onTodoAction({ type: "todo.add", title: draft })
            setDraft("")
          }}
        >
          <label htmlFor="task-title">新事项</label>
          <div className="composer-row">
            <input
              id="task-title"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="准备发布文档"
            />
            <button type="submit" className="icon-button" aria-label="添加事项">
              <TabIcon name="plus" />
            </button>
          </div>
        </form>
      </MultimodalGroup>

      <MultimodalGroup id="todo.filters" role="filter_tabs" label="待办过滤">
        <div className="segmented" role="tablist" aria-label="待办过滤">
          {(Object.keys(filterLabels) as TodoFilter[]).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={props.filter === value}
              type="button"
              onClick={() => props.onFilterChange(value)}
            >
              {filterLabels[value]}
            </button>
          ))}
        </div>
      </MultimodalGroup>

      <MultimodalGroup id="todo.list" role="list" label="待办列表" indexBy="visible_order">
        <div className="todo-list">
          {visibleTodos.length > 0 ? (
            visibleTodos.map((todo) => (
              <TodoListItem
                key={todo.id}
                todo={todo}
                onOpen={() => props.onNavigate({ screen: "todoDetail", todoId: todo.id })}
                onTodoAction={props.onTodoAction}
              />
            ))
          ) : (
            <div className="empty-state" role="status">
              <strong>没有匹配事项</strong>
              <span>切回全部或新增一条事项。</span>
            </div>
          )}
        </div>
      </MultimodalGroup>
    </div>
  )
}

function TodoListItem(props: {
  todo: Todo
  onOpen: () => void
  onTodoAction: (action: TodoAction) => void
}) {
  const { todo } = props

  return (
    <MultimodalGroup
      id={`todo.item.${todo.id}`}
      role="list_item"
      label={todo.title}
      entity={{ type: "todo", id: todo.id }}
      aliases={[todo.due, priorityLabels[todo.priority]]}
      state={{
        completed: todo.completed,
        due: todo.due,
        priority: todo.priority,
        description: todo.description,
      }}
    >
      <article className="task-card">
        <label className="task-check">
          <input
            type="checkbox"
            aria-label={todo.completed ? `取消完成 ${todo.title}` : `完成 ${todo.title}`}
            checked={todo.completed}
            onChange={() =>
              props.onTodoAction({
                type: todo.completed ? "todo.uncomplete" : "todo.complete",
                todoId: todo.id,
              })
            }
          />
          <span aria-hidden="true" />
        </label>

        <button type="button" className="task-open" onClick={props.onOpen}>
          <span className={todo.completed ? "done task-title" : "task-title"}>{todo.title}</span>
          <span className="task-description">{todo.description || "暂无详情"}</span>
          <span className="task-meta">
            <span>{todo.due}</span>
            <span className={`priority priority-${todo.priority}`}>
              {priorityLabels[todo.priority]}
            </span>
          </span>
        </button>
      </article>
    </MultimodalGroup>
  )
}

function TodoPreviewCard(props: { todo: Todo; onOpen: () => void }) {
  return (
    <button type="button" className="preview-card" onClick={props.onOpen}>
      <span>{props.todo.title}</span>
      <small>{props.todo.description}</small>
    </button>
  )
}

function TodoDetailScreen(props: {
  todo?: Todo
  onNavigate: (route: AppRoute) => void
  onTodoAction: (action: TodoAction) => void
}) {
  const [title, setTitle] = React.useState(props.todo?.title ?? "")
  const [description, setDescription] = React.useState(props.todo?.description ?? "")

  React.useEffect(() => {
    setTitle(props.todo?.title ?? "")
    setDescription(props.todo?.description ?? "")
  }, [props.todo])

  if (!props.todo) {
    return (
      <div className="page-flow">
        <section className="panel">
          <div className="empty-state">
            <strong>事项不存在</strong>
            <button
              type="button"
              className="button button-primary"
              onClick={() => props.onNavigate({ screen: "todos" })}
            >
              返回待办
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <MultimodalGroup
      id={`todo.detail.${props.todo.id}`}
      role="detail"
      label={props.todo.title}
      entity={{ type: "todo", id: props.todo.id }}
      state={{
        completed: props.todo.completed,
        due: props.todo.due,
        priority: props.todo.priority,
        description: props.todo.description,
      }}
    >
      <div className="page-flow">
        <button
          type="button"
          className="back-button"
          aria-label="返回待办"
          onClick={() => props.onNavigate({ screen: "todos" })}
        >
          <TabIcon name="back" />
          待办
        </button>

        <section className="detail-panel">
          <div className="detail-status">
            <span>{props.todo.completed ? "已完成" : "进行中"}</span>
            <span>{props.todo.due}</span>
          </div>

          <form
            className="detail-form"
            onSubmit={(event) => {
              event.preventDefault()
              props.onTodoAction({
                type: "todo.update",
                todoId: props.todo!.id,
                title,
                description,
              })
            }}
          >
            <label htmlFor="detail-title">标题</label>
            <input
              id="detail-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />

            <label htmlFor="detail-description">详情</label>
            <textarea
              id="detail-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
            />

            <div className="detail-actions">
              <button type="submit" className="button button-primary">
                保存
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  props.onTodoAction({
                    type: props.todo!.completed ? "todo.uncomplete" : "todo.complete",
                    todoId: props.todo!.id,
                  })
                }
              >
                {props.todo.completed ? "恢复" : "完成"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </MultimodalGroup>
  )
}

function SettingsScreen(props: {
  apiKey: string
  onApiKeyChange: (value: string) => void
}) {
  const [draft, setDraft] = React.useState(props.apiKey)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => setDraft(props.apiKey), [props.apiKey])

  return (
    <div className="page-flow">
      <section className="panel">
        <div className="section-header">
          <h2>SiliconFlow</h2>
          <span className={props.apiKey ? "status-dot active" : "status-dot"} />
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault()
            props.onApiKeyChange(draft.trim())
            setSaved(true)
          }}
        >
          <label htmlFor="api-key">API Key</label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setSaved(false)
            }}
            placeholder="YOUR_API_KEY"
          />
          <button type="submit" className="button button-primary">
            保存
          </button>
          <p className="form-status" aria-live="polite">
            {saved ? "已保存到本机" : props.apiKey ? "已配置" : "未配置"}
          </p>
        </form>
      </section>

      <section className="panel">
        <dl className="settings-list">
          <div>
            <dt>模型</dt>
            <dd>{chatModel}</dd>
          </div>
          <div>
            <dt>端点</dt>
            <dd>/api/chat</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

function FloatingChatbot(props: {
  apiKey: string
  open: boolean
  onNavigate: (route: AppRoute) => void
  onOpenChange: (open: boolean) => void
}) {
  const interactionApi = useInteractionApi()
  const [draft, setDraft] = React.useState("你好，请介绍一下你自己")
  const [status, setStatus] = React.useState<ChatStatus>("ready")
  const [isListening, setIsListening] = React.useState(false)
  const nextMessageId = React.useRef(1)
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null)
  const chatLogRef = React.useRef<HTMLDivElement | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "assistant_welcome",
      role: "assistant",
      content: "你好，我可以帮你拆任务、写计划，也可以直接回答问题。",
      state: "ready",
    },
  ])

  React.useEffect(() => {
    chatLogRef.current?.scrollTo?.({ top: chatLogRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, props.open])

  const submitMessage = React.useCallback(
    async (message: string) => {
      const trimmed = message.trim()
      if (!trimmed || status === "sending") return

      const userMessage: ChatMessage = {
        id: `user_${nextMessageId.current++}`,
        role: "user",
        content: trimmed,
        state: "ready",
      }
      const navigation = resolveNavigationCommand(trimmed)

      if (navigation) {
        props.onNavigate(navigation.route)
        setMessages((current) => [
          ...current,
          userMessage,
          {
            id: `assistant_${nextMessageId.current++}`,
            role: "assistant",
            content: navigation.reply,
            state: "ready",
          },
        ])
        setDraft("")
        setStatus("ready")
        return
      }

      if (shouldHandleLocally(trimmed)) {
        const localResult = await interactionApi.submitUtterance(trimmed)
        const localReply = createLocalInteractionReply(localResult)
        if (localReply) {
          setMessages((current) => [
            ...current,
            userMessage,
            {
              id: `assistant_${nextMessageId.current++}`,
              role: "assistant",
              content: localReply.content,
              state: localReply.state,
            },
          ])
          setDraft("")
          setStatus(localReply.state === "error" ? "error" : "ready")
          return
        }
      }

      if (!props.apiKey.trim()) {
        setMessages((current) => [
          ...current,
          userMessage,
          {
            id: `assistant_${nextMessageId.current++}`,
            role: "assistant",
            content: "请先在设置页填写 API Key。",
            state: "error",
          },
        ])
        setStatus("error")
        return
      }

      const pendingId = `assistant_${nextMessageId.current++}`
      const snapshotContext = createLlmSnapshotContext(interactionApi.getSnapshot(), {
        maxObjects: 100,
      })
      const apiMessages = [
        { role: "system", content: createChatSystemPrompt(snapshotContext) },
        ...messages
          .filter((item) => item.state !== "sending" && item.state !== "error")
          .map((item) => ({ role: item.role, content: item.content })),
        { role: "user", content: trimmed },
      ]

      setMessages((current) => [
        ...current,
        userMessage,
        { id: pendingId, role: "assistant", content: "正在生成回复...", state: "sending" },
      ])
      setDraft("")
      setStatus("sending")

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-siliconflow-api-key": props.apiKey.trim(),
          },
          body: JSON.stringify({
            model: chatModel,
            messages: apiMessages,
          }),
        })
        const data = await parseChatResponse(response)
        const content = data.choices?.[0]?.message?.content?.trim()

        setMessages((current) =>
          current.map((item) =>
            item.id === pendingId
              ? { ...item, content: content || "没有返回内容。", state: "ready" }
              : item
          )
        )
        setStatus("ready")
      } catch (error) {
        const message = error instanceof Error ? error.message : "请求失败"
        setMessages((current) =>
          current.map((item) =>
            item.id === pendingId ? { ...item, content: message, state: "error" } : item
          )
        )
        setStatus("error")
      }
    },
    [interactionApi, messages, props.apiKey, props.onNavigate, status]
  )

  function startSpeechInput() {
    const Recognition = getSpeechRecognition()

    if (!Recognition) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant_${nextMessageId.current++}`,
          role: "assistant",
          content: "当前浏览器不支持语音输入。",
          state: "error",
        },
      ])
      setStatus("error")
      return
    }

    recognitionRef.current?.stop()
    const recognition = new Recognition()
    recognition.lang = "zh-CN"
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim()
      if (transcript) setDraft((current) => (current ? `${current} ${transcript}` : transcript))
    }
    recognition.onerror = () => {
      setIsListening(false)
      setStatus("error")
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  if (!props.open) return null

  return (
    <section className="chat-sheet" aria-labelledby="floating-chat-heading" data-mm-ignore="true">
      <div className="sheet-handle" />
      <div className="sheet-header">
        <div>
          <p className="section-kicker">{chatModel}</p>
          <h2 id="floating-chat-heading">Chatbot</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭 Chatbot"
          onClick={() => props.onOpenChange(false)}
        >
          <TabIcon name="close" />
        </button>
      </div>

      <div className="chat-log" ref={chatLogRef} role="log" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`chat-message chat-message-${message.role}`}>
            <span className="message-role">{message.role === "user" ? "你" : "Assistant"}</span>
            <p className={message.state === "error" ? "message-error" : undefined}>
              {message.content}
            </p>
          </article>
        ))}
      </div>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void submitMessage(draft)
        }}
      >
        <label htmlFor="chat-message">消息</label>
        <textarea
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="输入消息"
          rows={3}
        />
        <div className="chat-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={startSpeechInput}
            disabled={isListening}
          >
            {isListening ? "聆听中" : "语音输入"}
          </button>
          <button type="submit" className="button button-primary" disabled={status === "sending"}>
            {status === "sending" ? "发送中" : "发送"}
          </button>
        </div>
      </form>
    </section>
  )
}

function BottomTabs(props: {
  route: AppRoute
  chatOpen: boolean
  onNavigate: (route: AppRoute) => void
  onChatOpenChange: (open: boolean) => void
}) {
  const activeTab = props.chatOpen ? "chatbot" : tabFromRoute(props.route)

  return (
    <nav className="bottom-tabs" aria-label="底部导航">
      {tabItems.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? "bottom-tab active" : "bottom-tab"}
          aria-current={activeTab === tab.id ? "page" : undefined}
          onClick={() => {
            if (tab.id === "chatbot") {
              props.onChatOpenChange(!props.chatOpen)
              return
            }
            if (tab.target) {
              props.onNavigate(tab.target)
            }
          }}
        >
          <TabIcon name={tab.icon} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function TabIcon(props: {
  name: "home" | "list" | "chat" | "settings" | "plus" | "close" | "back"
}) {
  const paths: Record<typeof props.name, React.ReactNode> = {
    home: <path d="M3 10.8 12 4l9 6.8V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
    chat: <path d="M4 5h16v11H8l-4 4z" />,
    settings: (
      <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8.5 3.8-1.8-.8-.5-1.3.7-1.9-2.1-2.1-1.9.7-1.3-.5L12.8 4h-3.6l-.8 2.1-1.3.5-1.9-.7-2.1 2.1.7 1.9-.5 1.3-1.8.8v3l1.8.8.5 1.3-.7 1.9 2.1 2.1 1.9-.7 1.3.5.8 2.1h3.6l.8-2.1 1.3-.5 1.9.7 2.1-2.1-.7-1.9.5-1.3 1.8-.8z" />
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    back: <path d="M15 18 9 12l6-6" />,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="tab-icon">
      {paths[props.name]}
    </svg>
  )
}

function getVisibleTodos(todos: Todo[], filter: TodoFilter): Todo[] {
  return todos.filter((todo) => {
    if (filter === "today") return todo.due === "今天"
    if (filter === "active") return !todo.completed
    if (filter === "completed") return todo.completed
    return true
  })
}

function createTodoPageState(route: AppRoute, todos: Todo[], filter: TodoFilter) {
  const activeTodos = todos.filter((todo) => !todo.completed)
  const visibleTodos = getVisibleTodos(todos, filter)
  const selectedTodo = route.todoId ? todos.find((todo) => todo.id === route.todoId) : undefined

  return {
    currentScreen: route.screen,
    filter,
    summary: {
      totalCount: todos.length,
      activeCount: activeTodos.length,
      completedCount: todos.length - activeTodos.length,
      todayCount: todos.filter((todo) => todo.due === "今天").length,
      visibleCount: visibleTodos.length,
    },
    selectedTodoId: selectedTodo?.id,
    visibleTodoIds: visibleTodos.map((todo) => todo.id),
    todos: todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      completed: todo.completed,
      due: todo.due,
      priority: todo.priority,
      priorityLabel: priorityLabels[todo.priority],
      description: todo.description,
    })),
  }
}

function createChatSystemPrompt(snapshotContext: ReturnType<typeof createLlmSnapshotContext>) {
  return [
    "你是一个有用的待办应用助手，回答要简洁、具体、可执行。",
    "你可以读取下方 Interaction Snapshot 中暴露的当前页面、可见对象和业务状态。用户询问页面、待办、筛选、数量或当前状态时，优先依据 snapshot.page.state 和 visibleObjects 回答。",
    "不要声称无法访问当前应用页面；如果用户询问的信息没有出现在快照里，就明确说明当前上下文没有提供该信息。",
    "如果用户要求修改待办或执行页面操作，在没有执行结果前不要假装已经完成，只说明可执行的操作或建议。",
    `Interaction Snapshot:\n${JSON.stringify(snapshotContext, null, 2)}`,
  ].join("\n\n")
}

function resolveNavigationCommand(text: string): { route: AppRoute; reply: string } | undefined {
  const normalized = text.replace(/[\s。！？!?,，.]+/g, "")

  if (/^(回到|返回|去|打开|进入|切到|切换到)?(首页|主页)(页面|页)?$/.test(normalized)) {
    return { route: { screen: "home" }, reply: "已回到首页。" }
  }

  if (/^(回到|返回|去|打开|进入|切到|切换到)?(待办|任务|任务列表|清单)(页面|页|列表)?$/.test(normalized)) {
    return { route: { screen: "todos" }, reply: "已打开待办列表。" }
  }

  if (/^(回到|返回|去|打开|进入|切到|切换到)?(设置|配置)(页面|页)?$/.test(normalized)) {
    return { route: { screen: "settings" }, reply: "已打开设置。" }
  }

  return undefined
}

function shouldHandleLocally(text: string): boolean {
  return /添加|新增|创建|删除|移除|删掉|完成|勾选|取消完成|取消勾选|只看|筛选|过滤|切到|切换|显示/.test(
    text
  )
}

function createLocalInteractionReply(
  result: InteractionSubmitResult
): { content: string; state: ChatStatus } | undefined {
  if (result.ok && result.executed) {
    const label = result.target?.label ? `「${result.target.label}」` : "目标"
    const action = result.action

    if (action?.type === "todo.complete") {
      return { content: `已将${label}标记为完成。`, state: "ready" }
    }
    if (action?.type === "todo.uncomplete") {
      return { content: `已将${label}恢复为未完成。`, state: "ready" }
    }
    if (action?.type === "todo.delete") {
      return { content: `已删除${label}。`, state: "ready" }
    }
    if (action?.type === "todo.add") {
      return { content: `已添加待办：${String(action.title ?? "") || "新事项"}。`, state: "ready" }
    }
    if (action?.type === "todo.filter") {
      const filter = action.filter as TodoFilter | undefined
      return {
        content: `已切换到${filter ? `「${filterLabels[filter]}」` : "指定"}筛选。`,
        state: "ready",
      }
    }
    if (action?.type === "todo.clearCompleted") {
      return { content: "已清除已完成待办。", state: "ready" }
    }

    return { content: `已执行：${String(action?.type ?? result.resolution.actionId ?? "操作")}。`, state: "ready" }
  }

  if (result.resolution.status === "needs_clarification") {
    return {
      content: result.resolution.reason ?? "我需要你再明确一下要操作哪一项。",
      state: "error",
    }
  }

  if (result.validation && !result.validation.ok && result.validation.code === "confirmation_required") {
    return { content: result.validation.reason, state: "error" }
  }

  if (result.validation && !result.validation.ok && result.validation.code === "state_changed") {
    return { content: result.validation.reason, state: "error" }
  }

  return undefined
}

function getPageMeta(route: AppRoute, todos: Todo[]) {
  if (route.screen === "home") {
    return { id: "page.home", title: "首页", eyebrow: "mobile todo app", path: "/" }
  }
  if (route.screen === "settings") {
    return { id: "page.settings", title: "设置", eyebrow: "siliconflow api", path: "/settings" }
  }
  if (route.screen === "todoDetail") {
    const todo = todos.find((item) => item.id === route.todoId)
    return {
      id: "page.todo.detail",
      title: todo?.title ?? "事项详情",
      eyebrow: "todo detail",
      path: route.todoId ? `/todos/${route.todoId}` : "/todos",
    }
  }
  return { id: "page.todos", title: "待办", eyebrow: "task list", path: "/todos" }
}

function tabFromRoute(route: AppRoute): TabId {
  if (route.screen === "settings") return "settings"
  if (route.screen === "todos" || route.screen === "todoDetail") return "todos"
  return "home"
}

function useBrowserRoute(): [AppRoute, (route: AppRoute) => void] {
  const [route, setRoute] = React.useState<AppRoute>(() => routeFromPath(window.location.pathname))

  React.useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname))
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const navigate = React.useCallback((nextRoute: AppRoute) => {
    const nextPath = pathForRoute(nextRoute)
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath)
    }
    setRoute(nextRoute)
  }, [])

  return [route, navigate]
}

function routeFromPath(pathname: string): AppRoute {
  if (pathname === "/settings") return { screen: "settings" }
  if (pathname === "/todos") return { screen: "todos" }
  if (pathname.startsWith("/todos/")) {
    return { screen: "todoDetail", todoId: decodeURIComponent(pathname.slice("/todos/".length)) }
  }
  return { screen: "home" }
}

function pathForRoute(route: AppRoute): string {
  if (route.screen === "settings") return "/settings"
  if (route.screen === "todos") return "/todos"
  if (route.screen === "todoDetail") return `/todos/${encodeURIComponent(route.todoId ?? "")}`
  return "/"
}

function useLocalStorage(key: string, initialValue: string) {
  const [value, setValue] = React.useState(() => window.localStorage.getItem(key) ?? initialValue)

  const updateValue = React.useCallback(
    (nextValue: string) => {
      setValue(nextValue)
      if (nextValue) window.localStorage.setItem(key, nextValue)
      else window.localStorage.removeItem(key)
    },
    [key]
  )

  return [value, updateValue] as const
}

async function parseChatResponse(response: Response): Promise<SiliconFlowResponse> {
  const text = await response.text()
  const data = text ? (JSON.parse(text) as SiliconFlowResponse) : {}

  if (!response.ok) {
    throw new Error(resolveChatError(data) || `请求失败：${response.status}`)
  }

  return data
}

function resolveChatError(data: SiliconFlowResponse): string | undefined {
  if (typeof data.error === "string") return data.error
  if (data.error?.message) return data.error.message
  return data.message
}

function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as Window &
    typeof globalThis & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}
