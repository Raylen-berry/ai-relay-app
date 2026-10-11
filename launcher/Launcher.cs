using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Web.Script.Serialization;

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
        ClientSize = new Size(660, 530);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft YaHei UI", 10);
        BackColor = Color.FromArgb(246,247,243);
        FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
        var brand = new PictureBox {Location=new Point(30,24),Size=new Size(48,48),SizeMode=PictureBoxSizeMode.Zoom};
        var brandPath = Path.Combine(root,"assets","relay-128.png");
        if(File.Exists(brandPath))brand.Image=Image.FromFile(brandPath);
        Controls.Add(brand);
        var title = new Label {Text="AI 互审 · Relay", Font=new Font(Font.FontFamily,23,FontStyle.Bold), ForeColor=Color.FromArgb(36,95,81), Location=new Point(88,26), AutoSize=true}; Controls.Add(title);
        var sub = new Label {Text="整理资料、完成任务，并保存成果与核对记录。",Location=new Point(30,82),AutoSize=true}; Controls.Add(sub);
        edge.Text="Microsoft Edge"; edge.Location=new Point(30,124); edge.Width=185;
        chrome.Text="Google Chrome"; chrome.Location=new Point(225,124); chrome.Width=185; edge.Checked=true;
        Controls.Add(edge); Controls.Add(chrome);
        try {var binding=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(Path.Combine(root,"browser-profile.json")));chrome.Checked=binding["browser"]=="chrome";edge.Checked=!chrome.Checked;}catch{}
        AddButton("打开互审工作台",30,171,290,48,OpenApp);
        AddButton("阅读安装与使用说明",340,171,290,48,delegate {OpenFile("开始使用.html");});
        var steps = new Label {Text="换机 / 首次使用（只需一次）\n\n1. 点下方「安装到本机」，自动创建桌面快捷方式。\n2. 网页模型需要在扩展管理页加载 extension；本机工作台可直接打开。\n3. 在同一浏览器登录模型；旧电脑的 JSON 可在工作台导入。",Location=new Point(30,244),Size=new Size(602,115)}; Controls.Add(steps);
        AddButton("打开扩展管理页",30,375,192,37,delegate {LaunchBrowser(edge.Checked?"edge://extensions/":"chrome://extensions/",false);});
        AddButton("复制 extension 路径",238,375,192,37,delegate {Clipboard.SetText(Path.Combine(root,"extension"));MessageBox.Show("文件夹路径已复制。在加载扩展的文件夹选择窗口中粘贴即可。","路径已复制");});
        AddButton("打开应用文件夹",446,375,184,37,delegate {Process.Start("explorer.exe", "\""+root+"\"");});
        AddButton("安装到本机 / 创建快捷方式",30,429,600,42,InstallApp);
        Controls.Add(new Label {Text="工作台保存在本机。网页连接需加载扩展，API 需另行配置。",Location=new Point(30,492),AutoSize=true,ForeColor=Color.FromArgb(105,126,110),Font=new Font(Font.FontFamily,9)});
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
        string browser=edge.Checked?"edge":"chrome",profile="Default";
        string dataDir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),browser=="chrome"?@"Google\Chrome\User Data":@"Microsoft\Edge\User Data");
        try {var binding=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(Path.Combine(root,"browser-profile.json")));if(binding["browser"]==browser){profile=binding["profile"];dataDir=binding["dataDir"];}}catch{}
        if(!System.Text.RegularExpressions.Regex.IsMatch(profile,@"^[\p{L}\p{N}_ -]{1,80}$")||dataDir.IndexOfAny(new[]{'"','\r','\n'})>=0)throw new Exception("浏览器配置无效，请重新创建快捷方式。");
        dataDir=Path.GetFullPath(dataDir).TrimEnd('\\');
        var info=new ProcessStartInfo(BrowserPath(),"--user-data-dir=\""+dataDir+"\" --profile-directory=\""+profile+"\" "+(app?"--app=":"")+"\""+url+"\"");
        info.UseShellExecute=true; Process.Start(info);
    }
    void OpenApp() {
        if(extensionId.Length!=32)throw new Exception("缺少应用配置，请完整解压压缩包后再打开。");
        string browser=edge.Checked?"edge":"chrome",bindingPath=Path.Combine(root,"browser-profile.json");
        Dictionary<string,string> binding=null;try{binding=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(bindingPath));}catch{}
        if(binding==null||!binding.ContainsKey("browser")||binding["browser"]!=browser){binding=new Dictionary<string,string>{{"browser",browser},{"profile","Default"},{"dataDir",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),browser=="chrome"?@"Google\Chrome\User Data":@"Microsoft\Edge\User Data")}};File.WriteAllText(bindingPath,new JavaScriptSerializer().Serialize(binding));}
        Process.Start(new ProcessStartInfo(Path.Combine(root,"AI互审本机核心.exe")){UseShellExecute=true});
    }
    void InstallApp() {
        string destination=File.Exists(Path.Combine(root,"installed.txt"))?root:Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","AI-Relay");
        string script=Path.Combine(root,"Install.ps1");
        if(!File.Exists(script))throw new Exception("缺少安装文件，请完整解压压缩包。");
        string powershell=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe");
        var info=new ProcessStartInfo(powershell,"-NoProfile -ExecutionPolicy Bypass -File \""+script+"\" -InstallDir \""+destination.TrimEnd('\\')+"\" -Browser "+(edge.Checked?"edge":"chrome"));
        info.UseShellExecute=false;info.CreateNoWindow=true;info.WindowStyle=ProcessWindowStyle.Hidden;
        info.RedirectStandardError=true;
        using(var process=Process.Start(info)) {
            string error=process.StandardError.ReadToEnd();process.WaitForExit();
            if(process.ExitCode!=0)throw new Exception("安装未完成："+error);
        }
        root=destination;Clipboard.SetText(Path.Combine(root,"extension"));
        MessageBox.Show("已安装并创建桌面快捷方式。\n\n扩展文件夹路径已复制。请在所选浏览器的扩展管理页加载此文件夹：\n"+Path.Combine(root,"extension")+"\n\n已有扩展只需重新加载。换机需要重新登录模型。","安装完成");
    }
    void OpenFile(string name) {Process.Start(new ProcessStartInfo(Path.Combine(root,name)){UseShellExecute=true});}
}
