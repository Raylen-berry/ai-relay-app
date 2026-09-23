using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

class Launcher : Form {
    RadioButton edge = new RadioButton();
    RadioButton chrome = new RadioButton();
    string root = AppDomain.CurrentDomain.BaseDirectory;
    string extensionId;
    [STAThread] static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Launcher());
    }
    Launcher() {
        Text = "AI 互审 · 启动助手";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        ClientSize = new Size(660, 470);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft YaHei UI", 10);
        BackColor = Color.FromArgb(246,247,243);
        FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
        var brand = new PictureBox {Location=new Point(30,24),Size=new Size(48,48),SizeMode=PictureBoxSizeMode.Zoom};
        var brandPath = Path.Combine(root,"assets","relay-128.png");
        if(File.Exists(brandPath))brand.Image=Image.FromFile(brandPath);
        Controls.Add(brand);
        var title = new Label {Text="AI 互审 · Relay", Font=new Font(Font.FontFamily,23,FontStyle.Bold), ForeColor=Color.FromArgb(36,95,81), Location=new Point(88,26), AutoSize=true}; Controls.Add(title);
        var sub = new Label {Text="用已登录的模型网页，按自定顺序完成初稿 → 多轮审核 → 定稿。",Location=new Point(30,82),AutoSize=true}; Controls.Add(sub);
        edge.Text="Microsoft Edge"; edge.Location=new Point(30,124); edge.Width=185;
        chrome.Text="Google Chrome"; chrome.Location=new Point(225,124); chrome.Width=185; chrome.Checked=true;
        Controls.Add(edge); Controls.Add(chrome);
        AddButton("打开互审工作台",30,171,290,48,OpenApp);
        AddButton("阅读安装与使用说明",340,171,290,48,delegate {OpenFile("开始使用.html");});
        var steps = new Label {Text="首次使用（只需一次）\n\n1. 打开扩展管理页，开启「开发人员模式」。\n2. 点击「加载解压缩的扩展」，选择本包的 extension 文件夹。\n3. 在同一浏览器登录所选模型，再打开互审工作台。",Location=new Point(30,244),Size=new Size(602,115)}; Controls.Add(steps);
        AddButton("打开扩展管理页",30,375,192,37,delegate {LaunchBrowser(edge.Checked?"edge://extensions/":"chrome://extensions/",false);});
        AddButton("复制 extension 路径",238,375,192,37,delegate {Clipboard.SetText(Path.Combine(root,"extension"));MessageBox.Show("文件夹路径已复制。在加载扩展的文件夹选择窗口中粘贴即可。","路径已复制");});
        AddButton("打开应用文件夹",446,375,184,37,delegate {Process.Start("explorer.exe", "\""+root+"\"");});
        Controls.Add(new Label {Text="本程序是启动助手；自动互审由浏览器扩展执行。无须配置 API Key。",Location=new Point(30,434),AutoSize=true,ForeColor=Color.FromArgb(105,126,110),Font=new Font(Font.FontFamily,9)});
        try {extensionId=File.ReadAllText(Path.Combine(root,"extension-id.txt")).Trim();}
        catch {extensionId="";}
    }
    void AddButton(string text,int x,int y,int w,int h,Action action) {
        var b = new Button {Text=text,Location=new Point(x,y),Size=new Size(w,h),FlatStyle=FlatStyle.Flat,BackColor=Color.White,ForeColor=Color.FromArgb(36,95,81)};
        b.FlatAppearance.BorderColor=Color.FromArgb(205,218,202);
        b.Click += delegate {try {action();} catch(Exception e) {MessageBox.Show(e.Message,"无法打开",MessageBoxButtons.OK,MessageBoxIcon.Information);}};
        Controls.Add(b);
    }
    string BrowserPath() {
        string rel=edge.Checked?@"Microsoft\Edge\Application\msedge.exe":@"Google\Chrome\Application\chrome.exe";
        foreach(string basePath in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}) {
            string p=Path.Combine(basePath,rel); if(File.Exists(p))return p;
        }
        throw new Exception("没有找到所选浏览器，请换一个浏览器。也可自行打开浏览器，点击 AI 互审扩展图标。");
    }
    void LaunchBrowser(string url,bool app) {
        var info=new ProcessStartInfo(BrowserPath(),(app?"--app=":"")+"\""+url+"\"");
        info.UseShellExecute=true; Process.Start(info);
    }
    void OpenApp() {
        if(extensionId.Length!=32)throw new Exception("缺少应用配置，请完整解压压缩包后再打开。");
        LaunchBrowser("chrome-extension://"+extensionId+"/app.html",true);
    }
    void OpenFile(string name) {Process.Start(new ProcessStartInfo(Path.Combine(root,name)){UseShellExecute=true});}
}
