fn main() {
    #[cfg(windows)]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("icon.ico");
        res.set("ProductName", "EduOne Secure Player");
        res.set("FileDescription", "EduOne Secure Player Native Client");
        res.set("LegalCopyright", "Copyright (C) 2026 FonixEdu");
        let _ = res.compile();
    }
}
