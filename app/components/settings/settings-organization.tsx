"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Check, Building2, Phone, Mail, Globe, MapPin, ShieldAlert, Sparkles } from "lucide-react"
import { useCurrentUser } from "@/components/current-user-provider"
import { getOrganizationProfile, saveOrganizationProfile, type OrganizationProfile } from "@/lib/organization/profile"

export function SettingsOrganization() {
  const { locale } = useI18n()
  const currentUser = useCurrentUser()
  const isArabic = locale === "ar"

  // Admin access check: org_admin, admin, or fallback in dev
  const isAdmin = !currentUser.role || currentUser.role === "org_admin" || currentUser.role === "admin"

  const [profile, setProfile] = useState<OrganizationProfile>(getOrganizationProfile)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setProfile(getOrganizationProfile())
  }, [])

  function handleChange(field: keyof OrganizationProfile, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    saveOrganizationProfile(profile)
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
          {/* Company Names */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nameEn">{isArabic ? "اسم المؤسسة (بالإنجليزية)" : "Company Name (English)"}</Label>
              <Input
                id="nameEn"
                value={profile.nameEn}
                onChange={(e) => handleChange("nameEn", e.target.value)}
                placeholder="e.g. Bonyan Engineering Consultancy"
              />
            </div>
            <div className="flex flex-col gap-2 font-arabic" dir="rtl">
              <Label htmlFor="nameAr">{isArabic ? "اسم المؤسسة (بالعربية)" : "Company Name (Arabic)"}</Label>
              <Input
                id="nameAr"
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

          {/* Save Action & Feedback */}
          <div className="flex items-center justify-between border-t pt-4">
            {saved ? (
              <span className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" />
                {isArabic ? "تم حفظ بيانات المؤسسة بنجاح!" : "Organization profile saved successfully!"}
              </span>
            ) : <span />}
            <Button type="submit">
              {isArabic ? "حفظ التغييرات" : "Save Organization Profile"}
            </Button>
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
