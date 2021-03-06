/*
 * Arc Menu - A traditional application menu for GNOME 3
 *
 * Arc Menu Lead Developer
 * Andrew Zaech https://gitlab.com/AndrewZaech
 * 
 * Arc Menu Founder/Maintainer/Graphic Designer
 * LinxGem33 https://gitlab.com/LinxGem33
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// Import Libraries
const Me = imports.misc.extensionUtils.getCurrentExtension();

const {Clutter, GLib, Gio, GMenu, Gtk, Shell, St} = imports.gi;
const AppFavorites = imports.ui.appFavorites;
const appSys = Shell.AppSystem.get_default();
const ArcSearch = Me.imports.search;
const Constants = Me.imports.constants;
const GnomeSession = imports.misc.gnomeSession;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const Main = imports.ui.main;
const MenuLayouts = Me.imports.menulayouts;
const MW = Me.imports.menuWidgets;
const PlaceDisplay = Me.imports.placeDisplay;
const PopupMenu = imports.ui.popupMenu;
const Utils =  Me.imports.utils;
const _ = Gettext.gettext;

var modernGnome = imports.misc.config.PACKAGE_VERSION >= '3.31.9';

var createMenu = class{
    constructor(mainButton) {
        this._button = mainButton;
        this._settings = mainButton._settings;
        this.section = mainButton.section;
        this.mainBox = mainButton.mainBox; 
        this.appMenuManager = mainButton.appMenuManager;
        this.leftClickMenu  = mainButton.leftClickMenu;
        this.mainBox.vertical = true;
        this.mainBox.style = null;
        this._applicationsButtons = new Map();
        this._session = new GnomeSession.SessionManager();
        this.isRunning=true;

        this._mainBoxKeyPressId = this.mainBox.connect('key-press-event', this._onMainBoxKeyPress.bind(this));

        this._tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
        this._treeChangedId = this._tree.connect('changed', ()=>{
            this.needsReload = true;
        });
        
        this._firstAppItem = null;
        this._firstApp = null;
        this._tabbedOnce = false;
        
        this._createLeftBox();
        this._loadCategories();
        this._display(); 
        this.leftClickMenu.actor.style = 'max-height: '+(this.leftClickMenu.actor.height + 250)+'px;';
    }
    _createLeftBox(){
    }
    updateIcons(){   
        this._applicationsButtons.forEach((value,key,map)=>{
            map.get(key)._updateIcon();
        });    
    }
    resetSearch(){ //used by back button to clear results
        this.setDefaultMenuView();  
    }
    setDefaultMenuView(){
        this.activeMenuItem = this.categoryDirectories[0];
        let actors = this.mainBox.get_children();
        for (let i = 0; i < actors.length; i++) {
            let actor = actors[i];
            if(actor._delegate instanceof MW.CategorySubMenuItem)
                actor._delegate.menu.close();
        }
    }
    _redisplayRightSide(){
    }
    _redisplay() {
    }
    _reload() {
        for (let i = 0; i < this.categoryDirectories.length; i++) {
            this.categoryDirectories[i].destroy();
        }    
        this._clearApplicationsBox();
        this._loadCategories();
        this._display();
    }
    // Display the menu
    _display() {
        this._displayCategories(); 
        this.activeMenuItem = this.categoryDirectories[0];      
    }
    updateStyle(){
    }
    // Load data for all menu categories
    _loadCategories() {
        this.applicationsByCategory = null;
        this.applicationsByCategory = {};              
        this.categoryDirectories = null;
        this.categoryDirectories=[]; 

        let categoryMenuItem = new MW.CategorySubMenuItem(this, "","Favorites");
        categoryMenuItem._setParent(this.leftClickMenu);
        this.leftClickMenu._connectItemSignals(categoryMenuItem);
        categoryMenuItem.isSimpleMenuItem = true;
        this.categoryDirectories.push(categoryMenuItem);  
        categoryMenuItem = new MW.CategorySubMenuItem(this, "","All Programs");
        categoryMenuItem._setParent(this.leftClickMenu);
        this.leftClickMenu._connectItemSignals(categoryMenuItem);
        categoryMenuItem.isSimpleMenuItem = true;
        this.categoryDirectories.push(categoryMenuItem);
        this._tree.load_sync();
        let root = this._tree.get_root_directory();
        let iter = root.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let dir = iter.get_directory();                  
                if (!dir.get_is_nodisplay()) {
                    let categoryId = dir.get_menu_id();
                    this.applicationsByCategory[categoryId] = [];
                    this._loadCategory(categoryId, dir);
                    categoryMenuItem = new MW.CategorySubMenuItem(this, dir);
                    categoryMenuItem._setParent(this.leftClickMenu);
                    this.leftClickMenu._connectItemSignals(categoryMenuItem);
                    categoryMenuItem.isSimpleMenuItem = true;
                    this.categoryDirectories.push(categoryMenuItem);
                }
            }
        }
    }
    // Load menu category data for a single category
    _loadCategory(categoryId, dir) {
        let iter = dir.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.ENTRY) {
                let entry = iter.get_entry();
                let id;
                try {
                    id = entry.get_desktop_file_id();
                } catch (e) {
                    continue;
                }
                let app = appSys.lookup_app(id);
                if (app ){
                    this.applicationsByCategory[categoryId].push(app);
                    let item = this._applicationsButtons.get(app);
                    if (!item) {
                        item = new MW.ApplicationMenuItem(this, app);
                        this._applicationsButtons.set(app, item);
                    }
                }
                    
            } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let subdir = iter.get_directory();
                if (!subdir.get_is_nodisplay())
                    this._loadCategory(categoryId, subdir);
            }
        }
    }
    _displayCategories(){
        this._clearApplicationsBox();

        for (let i = 0; i < this.categoryDirectories.length; i++) {
            this.mainBox.add_actor(this.categoryDirectories[i].actor);	
            this.mainBox.add_actor(this.categoryDirectories[i].menu.actor);
        }
        
        this.updateStyle();
    }
    _displayGnomeFavorites(categoryMenuItem){
        let appList = AppFavorites.getAppFavorites().getFavorites();
        appList.sort((a, b) => {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });
        this._displayButtons(appList,categoryMenuItem);
        this.updateStyle(); 
    }
    _displayPlaces() {
    }
    _loadFavorites() {  
    }
    _displayFavorites() {     
    }
    placesAddSeparator(id){ 
    }
    _redisplayPlaces(id) {
    }
    _createPlaces(id) {
    }
    _setActiveCategory(){
    }
    // Clear the applications menu box
    _clearApplicationsBox() {
        let children = this.mainBox.get_children();
        for (let i = 0; i < children.length; i++) {
            let item = children[i];
            this.mainBox.remove_actor(item);
        }
    }
    // Select a category or show category overview if no category specified
    selectCategory(dir, categoryMenuItem) {
        if (dir!="Frequent Apps") {
            this._displayButtons(this._listApplications(dir.get_menu_id()), categoryMenuItem);
        }
        else if(dir=="Frequent Apps") {
            this._displayButtons(this._listApplications("Frequent Apps"), categoryMenuItem);

        }
        else {
            //this._displayCategories();
        }
        this.updateStyle();
    }

    // Display application menu items
    _displayButtons(apps, categoryMenuItem) {
        if (apps) {
            let children = categoryMenuItem.menu.box.get_children();
            for (let i = 0; i < children.length; i++) {
                let item = children[i];
                categoryMenuItem.menu.box.remove_actor(item);
            }
            for (let i = 0; i < apps.length; i++) {
                let app = apps[i];
                let item = this._applicationsButtons.get(app);
                if (!item) {
                    item = new MW.ApplicationMenuItem(this, app);
                    this._applicationsButtons.set(app, item);
                }
                if(item.actor.get_parent()){
                    item.actor.get_parent().remove_actor(item.actor);
                }
                if (!item.actor.get_parent()) {
                        categoryMenuItem.menu.addMenuItem(item);
                }
                if(i==0){
                    item.setFakeActive(true);
                    item.grabKeyFocus();
                }
            }
        }
    }
    _displayAllApps(categoryMenuItem){
        let appList= []
        this._applicationsButtons.forEach((value,key,map) => {
            appList.push(key);
        });
        appList.sort((a, b) => {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });
        this._displayButtons(appList,categoryMenuItem);
        this.updateStyle(); 

    }
    // Get a list of applications for the specified category or search query
    _listApplications(category_menu_id) {
        let applist;

        // Get applications in a category or all categories
        if (category_menu_id) {
            applist = this.applicationsByCategory[category_menu_id];
        } else {
            applist = [];
            for (let directory in this.applicationsByCategory)
                applist = applist.concat(this.applicationsByCategory[directory]);
        }
        if(category_menu_id != "Frequent Apps"){
            applist.sort((a, b) => {
                return a.get_name().toLowerCase() > b.get_name().toLowerCase();
            });
        }
        
        return applist;
    }
    getShouldShowShortcut(shortcutName){
    }
    setCurrentMenu(menu){
        this.currentMenu = menu;
    }
    getCurrentMenu(){
        return this.currentMenu;
    } 
    _onMainBoxKeyPress(mainBox, event) {
        let symbol = event.get_key_symbol();
        let key = event.get_key_unicode();

        switch (symbol) {
            case Clutter.KEY_BackSpace:
            case Clutter.KEY_Tab:
            case Clutter.KEY_KP_Tab:
                return Clutter.EVENT_PROPAGATE;
            case Clutter.KEY_Up:
            case Clutter.KEY_Down:
            case Clutter.KEY_Left:
            case Clutter.KEY_Right:  
                if(this.activeMenuItem!=null && !this.activeMenuItem.actor.has_key_focus()){
                    this.activeMenuItem.actor.grab_key_focus();
                    return Clutter.EVENT_STOP;
                }
                else if(this.activeMenuItem!=null){
                    this.activeMenuItem.actor.grab_key_focus();
                    return Clutter.EVENT_PROPAGATE;
                }
                else{
                    return Clutter.EVENT_PROPAGATE;
                }
            case Clutter.KEY_KP_Enter:
            case Clutter.KEY_Return:
                return Clutter.EVENT_PROPAGATE;
            default:
                return Clutter.EVENT_PROPAGATE;
        }
    }
    destroy(){
        this.leftClickMenu.actor.style = null;
        for (let i = 0; i < this.categoryDirectories.length; i++) {
            this.categoryDirectories[i].destroy();
        }
        this.categoryDirectories=null;
        this._applicationsButtons=null;

        if (this._treeChangedId > 0) {
            this._tree.disconnect(this._treeChangedId);
            this._treeChangedId = 0;
            this._tree = null;
        }
        this.isRunning=false;

    }

};
