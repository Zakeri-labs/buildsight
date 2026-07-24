"use client"

import { useMemo, useState } from "react"
import { Search, Upload, FileText, Download, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/dashboard/page-header"
import { DocumentStatusBadge, DocumentTypeBadge } from "@/components/status-badge"
import { useI18n } from "@/lib/i18n"
import { documents, type DocumentType } from "@/lib/mock-data"

const typeOptions: (DocumentType | "all")[] = ["all", "drawing", "submittal", "rfi", "report", "contract"]

export function DocumentsList() {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [type, setType] = useState<DocumentType | "all">("all")

  const typeLabel: Record<DocumentType, string> = {
    drawing: t.documents.typeDrawing,
    submittal: t.documents.typeSubmittal,
    rfi: t.documents.typeRfi,
    report: t.documents.typeReport,
    contract: t.documents.typeContract,
  }

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesQuery =
        query === "" ||
        doc.name.toLowerCase().includes(query.toLowerCase()) ||
        doc.id.toLowerCase().includes(query.toLowerCase())
      const matchesType = type === "all" || doc.type === type
      return matchesQuery && matchesType
    })
  }, [query, type])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.documents.title}
        subtitle={t.documents.subtitle}
        action={
          <Button>
            <Upload data-icon="inline-start" />
            {t.documents.newDocument}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-inline-start-3 start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.documents.searchPlaceholder}
            className="ps-9"
          />
        </div>
        <Select value={type} onValueChange={(v) => setType(v as DocumentType | "all")}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder={t.documents.allTypes}>
              {(value) =>
                value === "all" ? t.documents.allTypes : typeLabel[value as DocumentType]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt === "all" ? t.documents.allTypes : typeLabel[opt]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.documents.name}</TableHead>
              <TableHead className="hidden md:table-cell">{t.documents.type}</TableHead>
              <TableHead className="hidden sm:table-cell">{t.documents.revision}</TableHead>
              <TableHead>{t.documents.status}</TableHead>
              <TableHead className="hidden lg:table-cell">{t.documents.uploadedBy}</TableHead>
              <TableHead className="hidden lg:table-cell">{t.documents.date}</TableHead>
              <TableHead className="text-end">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileText className="size-4" />
                    </span>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{doc.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {doc.id} · {doc.size}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <DocumentTypeBadge type={doc.type} />
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm tabular-nums">{doc.revision}</TableCell>
                <TableCell>
                  <DocumentStatusBadge status={doc.status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{doc.uploadedBy}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{doc.date}</TableCell>
                <TableCell className="text-end">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={t.reports.export}>
                      <Download />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="More">
                      <MoreVertical />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
