/*global define*/
define(['require'], function(require) {

    /**
     * Gets the translation of given key
     *
     * Example:
     *
     * Bundle:
     * myText = {
     *    name: 'My name is %1'
     * };
     *
     * Usage:
     * msg(myText.name, "Gerald") === "My name is Gerald"
     *
     * @param  {String} bundle_key key in the format bundle.key
     * @param  {String} [...]      Optional additional arguments to replace placeholders
     * @return {String}            Translated string
     */
    var msg = function(bundle_key /*, ... */) {
        bundle_key = bundle_key.split('.');
        var bundle = bundle_key[0];
        var key = bundle_key[1];
        var translations = require('i18n!locales/' + bundle);
        var message = translations[key];

        // Checks if the string replacement value is a string or a number
        // since the final argument could be a handlebars options object
        function validType(value) {
            return typeof(value) == 'string' || typeof(value) == 'number';
        }

        for (var i = 1; i < arguments.length && validType(arguments[i]); i++) {
            message = message.replace(new RegExp("%"+i, 'g'), arguments[i]);
        }

        return message;
    };

    return msg;
});
