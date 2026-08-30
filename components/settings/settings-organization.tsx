"use client"

import { useState, useEffect, useRef } from "react"
import { useI18n } from "@/lib/i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Check, Building2, Phone, Mail, Globe, MapPin, ShieldAlert, Sparkles, Upload, ImageIcon, Trash2 } from "lucide-react"
import { useCurrentUser } from "@/components/current-user-provider"
import { getOrganizationProfile, fetchOrganizationProfileFromDb, saveOrganizationProfile, type OrganizationProfile } from "@/lib/organization/profile"

export function SettingsOrganization() {
  const { locale } = useI18n()
  const currentUser = useCurrentUser()
  const isArabic = locale === "ar"
  const orgFileInputRef = useRef<HTMLInputElement>(null)
  const pdfFileInputRef = useRef<HTMLInputElement>(null)
  const pdfHeaderFileInputRef = useRef<HTMLInputElement>(null)

  // Admin access check: org_admin, admin, or fallback in dev
  const isAdmin = !currentUser.role || currentUser.role === "org_admin" || currentUser.role === "admin"

  const [profile, setProfile] = useState<OrganizationProfile>(getOrganizationProfile)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchOrganizationProfileFromDb().then((fetched) => {
      setProfile(fetched)
    })
  }, [])

  function handleChange(field: keyof OrganizationProfile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  function handleNumberChange(field: keyof OrganizationProfile, value: number) {
    setProfile((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function uploadLogoFile(file: File, type: string): Promise<string> {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("type", type)
    const res = await fetch("/api/organization/logo-upload", {
      method: "POST",
      body: formData,
    })
    if (!res.ok) throw new Error("Failed to upload logo")
    const data = await res.json()
    return data.url || ""
  }

  async function handleOrgLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    try {
      const url = await uploadLogoFile(file, "org-logo")
      if (url) {
        setProfile((prev) => ({ ...prev, logoUrl: url }))
        setSaved(false)
      }
    } catch {
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        if (dataUrl) {
          setProfile((prev) => ({ ...prev, logoUrl: dataUrl }))
          setSaved(false)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  function handleRemoveOrgLogo() {
    setProfile((prev) => ({ ...prev, logoUrl: "" }))
    setSaved(false)
  }

  async function handlePdfLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    try {
      const url = await uploadLogoFile(file, "pdf-logo")
      if (url) {
        setProfile((prev) => ({ ...prev, pdfLogoUrl: url }))
        setSaved(false)
      }
    } catch {
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        if (dataUrl) {
          setProfile((prev) => ({ ...prev, pdfLogoUrl: dataUrl }))
          setSaved(false)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  function handleRemovePdfLogo() {
    setProfile((prev) => ({ ...prev, pdfLogoUrl: "" }))
    setSaved(false)
  }

  async function handlePdfHeaderLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    try {
      const url = await uploadLogoFile(file, "pdf-header-logo")
      if (url) {
        setProfile((prev) => ({ ...prev, pdfHeaderLogoUrl: url }))
        setSaved(false)
      }
    } catch {
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        if (dataUrl) {
          setProfile((prev) => ({ ...prev, pdfHeaderLogoUrl: dataUrl }))
          setSaved(false)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  function handleRemovePdfHeaderLogo() {
    setProfile((prev) => ({ ...prev, pdfHeaderLogoUrl: "" }))
    setSaved(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const savedProfile = await saveOrganizationProfile(profile)
    setProfile(savedProfile)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex min-h-60 flex-col items-center justify-center p-6 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <ShieldAlert className="size-7" />
          </span>
          <h2 className="text-lg font-semibold">{isArabic ? "صلاحية الإدارة مطلوبة" : "Administrator Access Required"}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {isArabic
              ? "فقط مديري المؤسسة الاستشارية لديهم صلاحية تعديل بيانات ملف المؤسسة وفوتر تقارير PDF."
              : "Only Consultancy Administrators are authorized to update organization profile details and PDF report footers."}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Building2 className="size-5 text-primary" />
                {isArabic ? "ملف المؤسسة الاستشارية" : "Organization Profile"}
              </CardTitle>
              <CardDescription className="mt-1">
                {isArabic
                  ? "إدارة البيانات الرسمية ومعلومات التواصل للمؤسسة التي تظهر في فوتر خروجات تقارير الـ PDF."
                  : "Manage your consultancy details, commercial registration, and contact info used in PDF report footers."}
              </CardDescription>
            </div>
            <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
              {isArabic ? "للإدارة فقط" : "Admin Only"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Company Names & Configurable PDF Font Sizes */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="nameEn">{isArabic ? "اسم المؤسسة (بالإنجليزية)" : "Company Name (English)"}</Label>
                <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
                  <Label htmlFor="pdfHeaderCompanyNameEnFontSize" className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">
                    {isArabic ? "حجم الخط بالـ PDF:" : "PDF Font Size:"}
                  </Label>
                  <Input
                    id="pdfHeaderCompanyNameEnFontSize"
                    type="number"
                    min={6}
                    max={24}
                    step={0.5}
                    value={profile.pdfHeaderCompanyNameEnFontSize ?? 10.5}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      handleNumberChange("pdfHeaderCompanyNameEnFontSize", isNaN(val) ? 10.5 : Math.max(6, Math.min(24, val)))
                    }}
                    className="h-7 w-16 px-1.5 text-center text-xs font-medium"
                  />
                </div>
              </div>
              <Input
                id="nameEn"
                value={profile.nameEn}
                onChange={(e) => handleChange("nameEn", e.target.value)}
                placeholder="e.g. Bonyan Engineering Consultancy"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="nameAr" className="font-arabic">{isArabic ? "اسم المؤسسة (بالعربية)" : "Company Name (Arabic)"}</Label>
                <div className="flex items-center gap-1.5 shrink-0" dir="ltr">
                  <Label htmlFor="pdfHeaderCompanyNameArFontSize" className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">
                    {isArabic ? "حجم الخط بالـ PDF:" : "PDF Font Size:"}
                  </Label>
                  <Input
                    id="pdfHeaderCompanyNameArFontSize"
                    type="number"
                    min={6}
                    max={24}
                    step={0.5}
                    value={profile.pdfHeaderCompanyNameArFontSize ?? 8.5}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      handleNumberChange("pdfHeaderCompanyNameArFontSize", isNaN(val) ? 8.5 : Math.max(6, Math.min(24, val)))
                    }}
                    className="h-7 w-16 px-1.5 text-center text-xs font-medium"
                  />
                </div>
              </div>
              <Input
                id="nameAr"
                dir="rtl"
                className="font-arabic"
                value={profile.nameAr}
                onChange={(e) => handleChange("nameAr", e.target.value)}
                placeholder="مثال: بنيان للاستشارات الهندسية"
              />
            </div>
          </div>

          {/* Registration & Postal */}
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="crNumber">{isArabic ? "رقم السجل التجاري (س.ت / C.R. No.)" : "Commercial Reg. (C.R. No.)"}</Label>
              <Input
                id="crNumber"
                value={profile.crNumber}
                onChange={(e) => handleChange("crNumber", e.target.value)}
                placeholder="e.g. 1241340"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="poBox">{isArabic ? "صندوق البريد (ص.ب / P.O. Box)" : "P.O. Box"}</Label>
              <Input
                id="poBox"
                value={profile.poBox}
                onChange={(e) => handleChange("poBox", e.target.value)}
                placeholder="e.g. 1015"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="postalCode">{isArabic ? "الرمز البريدي (ر.ب / Postal Code)" : "Postal Code"}</Label>
              <Input
                id="postalCode"
                value={profile.postalCode}
                onChange={(e) => handleChange("postalCode", e.target.value)}
                placeholder="e.g. 132"
              />
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="phones" className="flex items-center gap-1.5">
                <Phone className="size-3.5 text-muted-foreground" />
                {isArabic ? "أرقام التواصل (الهاتف)" : "Phone Numbers"}
              </Label>
              <Input
                id="phones"
                value={profile.phones}
                onChange={(e) => handleChange("phones", e.target.value)}
                placeholder="e.g. +968 9411 4511, 9546 2124"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" />
                {isArabic ? "البريد الإلكتروني الرسمي" : "Official Email"}
              </Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="e.g. info@bonyan-om.com"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="website" className="flex items-center gap-1.5">
                <Globe className="size-3.5 text-muted-foreground" />
                {isArabic ? "الموقع / حساب التواصل" : "Website / Social Handle"}
              </Label>
              <Input
                id="website"
                value={profile.website}
                onChange={(e) => handleChange("website", e.target.value)}
                placeholder="e.g. @bonyanec or www.bonyan-om.com"
              />
            </div>
          </div>

          {/* Addresses */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="addressEn" className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground" />
                {isArabic ? "العنوان بالعنوان بالإنجليزية" : "Official Address (English)"}
              </Label>
              <Input
                id="addressEn"
                value={profile.addressEn}
                onChange={(e) => handleChange("addressEn", e.target.value)}
                placeholder="e.g. Al Seeb, Al Mabela, Sultanate of Oman"
              />
            </div>
            <div className="flex flex-col gap-2 font-arabic" dir="rtl">
              <Label htmlFor="addressAr" className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground" />
                {isArabic ? "العنوان بالعربية" : "Official Address (Arabic)"}
              </Label>
              <Input
                id="addressAr"
                value={profile.addressAr}
                onChange={(e) => handleChange("addressAr", e.target.value)}
                placeholder="مثال: السيب، المعبيلة، سلطنة عمان"
              />
            </div>
          </div>

          {/* Organization Logo, PDF Logo & PDF Header Logo 3-Column Section */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* 1. Organization Logo */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                    <ImageIcon className="size-4 text-primary" />
                    {isArabic ? "شعار المؤسسة" : "Organization Logo"}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isArabic
                      ? "قم برفع شعار المؤسسة الخاص بك ليظهر في أعلى شريط التنقل الجانبي (Sidebar)."
                      : "Upload your custom organization logo to display in the top-left sidebar header."}
                  </p>
                </div>
                {profile.logoUrl ? (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {isArabic ? "شعار مخصص" : "Custom Logo"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                    {isArabic ? "الشعار الافتراضي" : "Default Logo"}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                {/* Preview Box */}
                <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar p-2 shadow-inner">
                  <img
                    src={profile.logoUrl || "/Logow.png"}
                    alt="Organization Logo Preview"
                    className="max-h-12 w-auto max-w-full object-contain"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={orgFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleOrgLogoUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => orgFileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 size-4" />
                    {profile.logoUrl
                      ? (isArabic ? "تغيير" : "Change")
                      : (isArabic ? "رفع الشعار" : "Upload Logo")}
                  </Button>

                  {profile.logoUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={handleRemoveOrgLogo}
                    >
                      <Trash2 className="mr-2 size-4" />
                      {isArabic ? "إزالة" : "Remove"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* 2. PDF Logo */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                    <ImageIcon className="size-4 text-purple-600 dark:text-purple-400" />
                    {isArabic ? "شعار تقارير PDF" : "PDF Logo"}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isArabic
                      ? "رفع شعار مخصص ومستقل مخصص لتقارير الـ PDF."
                      : "Upload a separate custom logo reserved for report PDF templates."}
                  </p>
                </div>
                {profile.pdfLogoUrl ? (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {isArabic ? "شعار مخصص" : "Custom Logo"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                    {isArabic ? "الشعار الافتراضي" : "Default Logo"}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                {/* Preview Box */}
                <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-2 shadow-inner dark:border-slate-800 dark:bg-slate-950">
                  <img
                    src={profile.pdfLogoUrl || "/bonyan-closing-logo.png"}
                    alt="PDF Logo Preview"
                    className="max-h-12 w-auto max-w-full object-contain"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={pdfFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePdfLogoUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => pdfFileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 size-4" />
                    {profile.pdfLogoUrl
                      ? (isArabic ? "تغيير" : "Change")
                      : (isArabic ? "رفع الشعار" : "Upload Logo")}
                  </Button>

                  {profile.pdfLogoUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={handleRemovePdfLogo}
                    >
                      <Trash2 className="mr-2 size-4" />
                      {isArabic ? "إزالة" : "Remove"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* 3. PDF Header Logo */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                    <ImageIcon className="size-4 text-blue-600 dark:text-blue-400" />
                    {isArabic ? "شعار هيدر الـ PDF" : "PDF Header Logo"}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isArabic
                      ? "رفع شعار مخصص لاستخدامه حصراً في هيدر تقارير الـ PDF."
                      : "Upload a custom logo used specifically in the PDF report header."}
                  </p>
                </div>
                {profile.pdfHeaderLogoUrl ? (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {isArabic ? "شعار مخصص" : "Custom Logo"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                    {isArabic ? "الشعار الافتراضي" : "Default Logo"}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                {/* Preview Box */}
                <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-2 shadow-inner dark:border-slate-800 dark:bg-slate-950">
                  <img
                    src={profile.pdfHeaderLogoUrl || "/LogoB.png"}
                    alt="PDF Header Logo Preview"
                    className="max-h-12 w-auto max-w-full object-contain"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={pdfHeaderFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePdfHeaderLogoUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => pdfHeaderFileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 size-4" />
                    {profile.pdfHeaderLogoUrl
                      ? (isArabic ? "تغيير" : "Change")
                      : (isArabic ? "رفع الشعار" : "Upload Logo")}
                  </Button>

                  {profile.pdfHeaderLogoUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={handleRemovePdfHeaderLogo}
                    >
                      <Trash2 className="mr-2 size-4" />
                      {isArabic ? "إزالة" : "Remove"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Save Action & Feedback */}
          <div className="flex items-center justify-between border-t pt-4">
            {saved ? (
              <span className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" />
                {isArabic ? "تم حفظ بيانات المؤسسة بنجاح!" : "Organization profile saved successfully!"}
              </span>
            ) : null}
            <Button type="submit">
              {isArabic ? "حفظ التغييرات" : "Save Organization Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live PDF Header Preview Card */}
      <Card className="overflow-hidden border-amber-200/80 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20">
        <CardHeader className="border-b border-amber-100 bg-amber-100/60 px-5 py-3.5 dark:border-amber-900/40 dark:bg-amber-900/40 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
            <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
            {isArabic ? "معاينة هيدر الـ PDF الحية" : "Live PDF Header Preview"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            {/* Top Golden Separator Line */}
            <div className="h-1 bg-amber-600 dark:bg-amber-500" />

            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Left Column: PDF Header Logo */}
              <div className="flex shrink-0 items-center justify-center sm:justify-start">
                <img
                  src={profile.pdfHeaderLogoUrl || "/LogoB.png"}
                  alt="PDF Header Logo Preview"
                  className="h-10 w-auto max-w-[140px] object-contain"
                />
              </div>

              {/* Center Column: Company Name EN + AR with live dynamic font sizes */}
              <div className="flex flex-col items-center justify-center text-center max-w-full overflow-hidden px-2">
                <span
                  style={{
                    fontSize: `${Math.max(10, Math.min(24, (profile.pdfHeaderCompanyNameEnFontSize ?? 10.5) * 1.15))}px`,
                  }}
                  className="font-bold tracking-tight text-slate-900 transition-all dark:text-slate-100 max-w-full truncate"
                >
                  {profile.nameEn || (isArabic ? "اسم المؤسسة (بالإنجليزية)" : "Company Name (English)")}
                </span>
                <span
                  dir="rtl"
                  style={{
                    fontSize: `${Math.max(9, Math.min(22, (profile.pdfHeaderCompanyNameArFontSize ?? 8.5) * 1.15))}px`,
                  }}
                  className="font-arabic font-bold text-amber-700 transition-all dark:text-amber-400 max-w-full truncate mt-0.5"
                >
                  {profile.nameAr || (isArabic ? "اسم المؤسسة (بالعربية)" : "Company Name (Arabic)")}
                </span>
              </div>

              {/* Right Column: Representative Metadata (Aligned 3-row column) */}
              <div className="flex shrink-0 flex-col text-xs text-slate-600 dark:text-slate-400 text-start sm:text-end space-y-1 min-w-[175px]">
                <div className="flex items-center justify-between sm:justify-end gap-3 text-[11px]">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{isArabic ? "التاريخ:" : "Date:"}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">2026-08-30</span>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 text-[11px]">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{isArabic ? "رقم المستند:" : "Doc No.:"}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">Bonyan/sup/2026/048/001</span>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 text-[11px]">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{isArabic ? "الصفحة:" : "Page:"}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">1 / 4</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live PDF Footer Preview Card */}
      <Card className="overflow-hidden border-blue-200/80 bg-blue-50/40 dark:border-blue-900/60 dark:bg-blue-950/20">
        <CardHeader className="border-b border-blue-100 bg-blue-100/60 px-5 py-3.5 dark:border-blue-900/40 dark:bg-blue-900/40 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-blue-950 dark:text-blue-100">
            <Sparkles className="size-4 text-blue-600 dark:text-blue-400" />
            {isArabic ? "معاينة فوتر الـ PDF الحية" : "Live PDF Footer Preview"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-sky-400" />
            <div className="mt-3 flex flex-col gap-3 text-xs text-slate-700 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              {/* Left Column: Phones, Social, Email */}
              <div className="space-y-1">
                {profile.phones ? (
                  <p className="flex items-center gap-1.5 font-medium">
                    <Phone className="size-3 text-blue-600 dark:text-blue-400" />
                    {profile.phones}
                  </p>
                ) : null}
                {profile.website || profile.email ? (
                  <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Globe className="size-3 text-purple-600 dark:text-purple-400" />
                    {[profile.website, profile.email].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>

              {/* Right Column: CR, PO Box, Address */}
              <div className="space-y-1 text-start sm:text-end">
                <p className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                  C.R. No.: {profile.crNumber || "—"}, P.O. Box : {profile.poBox || "—"}, Postal Code : {profile.postalCode || "—"}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {profile.addressEn}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] text-slate-400">
              <span>{profile.nameEn || profile.nameAr}</span>
              <span>Page 1 / 1</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
